import dayjs from 'dayjs'
import debug from 'debug'

import {
  start_docker_container,
  stop_docker_container,
  get_docker_containers
} from './docker.mjs'
import { create_ib_client, connect_ib_with_retry } from './connection.mjs'
import {
  get_account_positions,
  get_account_summary,
  group_positions_by_strategy,
  calculate_option_liabilities,
  account_summary_tags
} from './positions.mjs'
import { get_stock_market_data, get_market_data } from './market-data.mjs'
import config from '#config'

const log = debug('interactive-brokers')

export const get_account_info = async ({
  host,
  docker_port = 2375,
  ibkr_port = 4002,
  keep_alive = false
}) => {
  const containers = await get_docker_containers({
    host,
    port: docker_port
  })
  const container = containers.find(
    (container) => container.Image === config.ib_gateway_docker_image
  )

  if (!container) {
    throw new Error('ib-gateway-docker container not found')
  }

  let container_just_started = false
  if (container.State !== 'running') {
    const res_status = await start_docker_container({
      host,
      port: docker_port,
      id: container.Id
    })
    log(`docker container started (status: ${res_status})`)
    container_just_started = true
  }

  const ib = create_ib_client({ host, port: ibkr_port })

  try {
    // If container was just started, use longer initial delay
    await connect_ib_with_retry({
      ib,
      initial_delay: container_just_started ? 5000 : 2000
    })

    const account_positions = await get_account_positions(ib)
    const account_summary = await get_account_summary(ib)

    // Filter short options positions
    const short_options = account_positions.filter(
      (position) => position.contract.secType === 'OPT' && position.pos < 0
    )

    // Create map of stock positions by symbol
    const stock_positions = new Map(
      account_positions
        .filter((position) => position.contract.secType === 'STK')
        .map((position) => [position.contract.symbol, position])
    )

    // Get unique symbols from options positions
    const option_symbols = [
      ...new Set(short_options.map((position) => position.contract.symbol))
    ]

    // Fetch market data for underlying stocks
    const stock_market_data = new Map()
    for (const symbol of option_symbols) {
      try {
        const market_data = await get_stock_market_data({ ib, symbol })
        stock_market_data.set(symbol, market_data)
      } catch (error) {
        console.error(`Error fetching market data for ${symbol}:`, error)
      }
    }

    // Fetch market data for all short options positions
    const positions_with_market_data = []

    for (const position of short_options) {
      let market_data = {
        price: null,
        impliedVol: null,
        delta: null,
        underlying_price: null
      }

      try {
        market_data = await get_market_data({
          ib,
          contract: position.contract
        })
      } catch (error) {
        log(
          `Error fetching market data for ${position.contract.symbol} option:`,
          error.error ? error.error.toString() : error.toString()
        )
      }

      // If option market data doesn't have underlying price, use the stock market data
      const stock_data = stock_market_data.get(position.contract.symbol)
      if (stock_data && stock_data.price) {
        market_data.underlying_price = stock_data.price
      }

      positions_with_market_data.push({ ...position, market_data })
    }

    // Group positions by strategy
    const strategies = group_positions_by_strategy(account_positions)

    // Calculate strategy-based liabilities
    const strategy_liabilities = Array.from(strategies.values())
      .filter((s) => s.strategy_type !== 'COVERED_CALL' || s.max_risk > 0)
      .map((s) => ({
        underlying: s.underlying,
        expiration: s.expiration,
        strategy_type: s.strategy_type,
        max_risk: s.max_risk,
        max_profit: s.max_profit,
        breakeven_points: s.breakeven_points,
        positions: s.positions.map((p) => ({
          symbol: p.contract.symbol,
          right: p.contract.right,
          strike: p.contract.strike,
          quantity: p.pos,
          delta:
            positions_with_market_data.find(
              (m) => m.contract.conId === p.contract.conId
            )?.market_data?.delta || null
        }))
      }))

    // Calculate option liabilities
    const option_liabilities = calculate_option_liabilities(
      account_positions,
      stock_positions
    )

    // Calculate liabilities at different probability thresholds
    const probability_thresholds = [
      0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.7, 0.9
    ]
    const liability_by_probability = {}

    const result = {}
    for (const tag of account_summary_tags) {
      const value = account_summary.get(tag)
      if (value) {
        result[tag] = Number(value)
      }
    }

    // Update result with new liability calculations
    result.option_cash_liability = option_liabilities.max_liability
    result.unlimited_risk_positions =
      option_liabilities.unlimited_risk_positions
    result.limited_risk_positions = option_liabilities.limited_risk_positions
    result.uncovered_put_liabilities =
      option_liabilities.uncovered_put_liabilities
    result.total_uncovered_put_liability =
      option_liabilities.total_uncovered_put_liability

    result.liabilities = account_positions
      .filter(
        (position) => position.contract.secType === 'OPT' && position.pos < 0
      )
      .map((position) => {
        const expiration_date = dayjs(
          position.contract.lastTradeDateOrContractMonth,
          'YYYYMMDD'
        )
        const days_remaining = expiration_date.diff(dayjs(), 'day')

        // Find matching market data for this position
        const position_with_market_data = positions_with_market_data.find(
          (p) => p.contract.conId === position.contract.conId
        )

        // Get the stock price from stock_market_data Map
        const stock_data = stock_market_data.get(position.contract.symbol)
        const underlying_price = stock_data?.price || null
        const current_delta =
          position_with_market_data?.market_data?.delta || null

        return {
          name: `${position.contract.symbol} ${position.contract.right} ${position.contract.strike} ${position.contract.lastTradeDateOrContractMonth}`,
          amount: Math.abs(
            position.contract.strike *
              position.pos *
              position.contract.multiplier
          ),
          days: days_remaining,
          underlying_price,
          delta: current_delta
        }
      })

    // Update probability-based liabilities calculation
    for (const threshold of probability_thresholds) {
      liability_by_probability[
        `total_liability_greater_than_${threshold * 100}pct_prob`
      ] = positions_with_market_data
        .filter((position) => {
          const delta = position.market_data.delta
          if (!delta) return false
          return position.contract.right === 'P'
            ? 1 - Math.abs(delta) >= threshold // Put option
            : Math.abs(delta) >= threshold // Call option
        })
        .reduce((acc, position) => {
          const stock_position = stock_positions.get(position.contract.symbol)
          const shares_held = stock_position ? stock_position.pos : 0
          const contracts = Math.abs(position.pos)
          const shares_needed = contracts * position.contract.multiplier

          if (position.contract.right === 'C' && shares_held >= shares_needed) {
            // Call is fully covered by shares, no liability
            return acc
          } else if (position.contract.right === 'C' && shares_held > 0) {
            // Call is partially covered, calculate remaining liability
            const uncovered_contracts =
              (shares_needed - shares_held) / position.contract.multiplier
            return (
              acc +
              position.contract.strike *
                uncovered_contracts *
                position.contract.multiplier
            )
          } else {
            // Put or uncovered call
            return (
              acc +
              position.contract.strike *
                contracts *
                position.contract.multiplier
            )
          }
        }, 0)
    }

    result.liability_by_probability = liability_by_probability

    // Update result with strategy-based liabilities
    result.strategy_liabilities = strategy_liabilities
    result.total_strategy_risk = strategy_liabilities.reduce(
      (acc, s) => acc + s.max_risk,
      0
    )

    ib.disconnect()

    if (!keep_alive) {
      const res_stop_status = await stop_docker_container({
        host,
        port: docker_port,
        id: container.Id
      })
      log(`docker container stopped (status: ${res_stop_status})`)
    }

    return result
  } catch (error) {
    console.error(error)
    throw new Error(`Error fetching account info: ${error.message}`)
  }
}
