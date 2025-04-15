import fetch from 'node-fetch'
import dayjs from 'dayjs'
import debug from 'debug'
import {
  IBApiNext,
  EventName,
  IBApiNextTickType,
  IBApiTickType,
  MarketDataType
} from '@stoqey/ib'

import db from '#db'
import refresh_historical_quotes from './refresh-historical-quotes.mjs'
import { get_option_delta } from './tradingview.mjs'

import config from '#config'

const log = debug('interactive-brokers')

export const start_docker_container = async ({ host, port = 2375, id }) => {
  const url = `http://${host}:${port}/containers/${id}/start`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  })

  return response.status
}

export const stop_docker_container = async ({ host, port = 2375, id }) => {
  const url = `http://${host}:${port}/containers/${id}/stop`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  })

  return response.status
}

export const get_docker_containers = async ({ host, port = 2375 }) => {
  const url = `http://${host}:${port}/containers/json?all=true`
  const response = await fetch(url)
  return response.json()
}

const account_summary_tags = [
  'NetLiquidation',
  'TotalCashValue',
  'SettledCash',
  'GrossPositionValue'
]
const get_account_summary = (ib) =>
  new Promise((resolve, reject) => {
    const summary = new Map()

    const cleanupListeners = []

    const accountSummaryHandler = (req_id, account, tag, value) => {
      if (!summary.has(tag)) {
        summary.set(tag, value)
      }
    }

    const accountSummaryEndHandler = () => {
      cleanup()
      resolve(summary)
    }

    const errorHandler = (err) => {
      cleanup()
      reject(err)
    }

    const cleanup = () => {
      cleanupListeners.forEach((remove) => remove())
    }

    cleanupListeners.push(
      () => ib.api.off(EventName.accountSummary, accountSummaryHandler),
      () => ib.api.off(EventName.accountSummaryEnd, accountSummaryEndHandler),
      () => ib.api.off(EventName.error, errorHandler)
    )

    ib.api.on(EventName.accountSummary, accountSummaryHandler)
    ib.api.on(EventName.accountSummaryEnd, accountSummaryEndHandler)
    ib.api.on(EventName.error, errorHandler)

    ib.getAccountSummary('All', account_summary_tags.join(',')).subscribe({
      error: (err) => {
        log('Error in account summary subscription:', err)
        cleanup()
        reject(err)
      }
    })
  })

const get_account_positions = (ib) =>
  new Promise((resolve, reject) => {
    const positions = []
    const cleanupListeners = []

    const positionHandler = (account, contract, pos, avgCost) => {
      positions.push({ account, contract, pos, avgCost })
    }

    const positionEndHandler = () => {
      cleanup()
      resolve(positions)
    }

    const errorHandler = (err) => {
      cleanup()
      reject(err)
    }

    const cleanup = () => {
      cleanupListeners.forEach((remove) => remove())
    }

    cleanupListeners.push(
      () => ib.api.off(EventName.position, positionHandler),
      () => ib.api.off(EventName.positionEnd, positionEndHandler),
      () => ib.api.off(EventName.error, errorHandler)
    )

    ib.api.on(EventName.position, positionHandler)
    ib.api.on(EventName.positionEnd, positionEndHandler)
    ib.api.on(EventName.error, errorHandler)

    ib.getPositions().subscribe({
      error: errorHandler
    })
  })

const get_market_data = async ({ ib, contract, delayed = false }) => {
  return new Promise((resolve, reject) => {
    let market_data = {
      price: null,
      impliedVol: null,
      delta: null,
      underlying_price: null
    }
    let has_received_data = false
    let subscription = null
    let timeout_id = null

    const contract_with_exchange = {
      ...contract,
      exchange: contract.exchange || 'SMART'
    }

    ib.setMarketDataType(
      delayed ? MarketDataType.DELAYED : MarketDataType.REAL_TIME
    )

    const cleanup_and_resolve = async () => {
      if (subscription) {
        subscription.unsubscribe()
      }
      if (timeout_id) {
        clearTimeout(timeout_id)
      }

      // If no delta value was received, try to get it from TradingView
      if (market_data.delta === null && contract.secType === 'OPT') {
        try {
          // Extract data from contract for TradingView API
          const symbol = contract.symbol
          const expiration_date = parseInt(
            contract.lastTradeDateOrContractMonth
          )

          // Convert 'C'/'P' to 'call'/'put' as expected by TradingView API
          const option_type = contract.right === 'C' ? 'call' : 'put'
          const strike = parseFloat(contract.strike)

          // Get delta from TradingView
          const delta = await get_option_delta({
            symbol,
            expiration_date,
            option_type,
            strike
          })

          if (delta !== null) {
            market_data.delta = Math.abs(delta) // Ensure positive delta value
            log(
              `Retrieved delta for ${symbol} ${expiration_date} ${option_type} ${strike} from TradingView: ${delta}`
            )
          }
        } catch (error) {
          log(`Failed to get delta from TradingView: ${error.message}`)
        }
      }

      if (!has_received_data) {
        log(
          `No market data received for contract: ${JSON.stringify(
            contract_with_exchange
          )}`
        )
      }
      resolve(market_data)
    }

    subscription = ib
      .getMarketData(contract_with_exchange, null, false, false)
      .subscribe({
        next: (update) => {
          const update_data = new Map()

          // Handle regular market data updates
          update.all.forEach((tick, type) => {
            // Convert numeric tick types to their string representations
            const tick_type =
              type > IBApiNextTickType.API_NEXT_FIRST_TICK_ID
                ? IBApiNextTickType[type]
                : IBApiTickType[type]

            update_data.set(tick_type, tick.value)
          })

          // Extract option-specific data
          const model_delta =
            update_data.get('MODEL_OPTION_DELTA') ||
            update_data.get('DELAYED_MODEL_OPTION_DELTA')
          const model_iv =
            update_data.get('MODEL_OPTION_IV') ||
            update_data.get('DELAYED_MODEL_OPTION_IV')

          // Extract price data with fallbacks
          const last_price =
            update_data.get('LAST') || update_data.get('DELAYED_LAST')
          const close_price =
            update_data.get('CLOSE') || update_data.get('DELAYED_CLOSE')
          const bid_price =
            update_data.get('BID') || update_data.get('DELAYED_BID')
          const ask_price =
            update_data.get('ASK') || update_data.get('DELAYED_ASK')

          // Use mid price if no last price available
          const mid_price =
            bid_price && ask_price ? (bid_price + ask_price) / 2 : null
          const price = last_price || close_price || mid_price

          if (model_delta || model_iv || price) {
            market_data = {
              ...market_data,
              delta: model_delta ? Math.abs(model_delta) : market_data.delta,
              impliedVol: model_iv || market_data.impliedVol,
              price: price || market_data.price
            }
            has_received_data = true

            // If we have all the data we need, resolve immediately
            if (
              market_data.price &&
              market_data.delta &&
              market_data.impliedVol
            ) {
              cleanup_and_resolve()
            }
          }
        },
        error: (err) => {
          log('Error receiving market data:', err)
          cleanup_and_resolve()
        }
      })

    // Set a timeout to resolve after a maximum wait time
    timeout_id = setTimeout(cleanup_and_resolve, 30000)
  })
}

const get_stock_market_data = async ({ ib, symbol }) => {
  const contract = {
    secType: 'STK',
    symbol,
    exchange: 'SMART',
    currency: 'USD'
  }

  let market_data = {
    price: null,
    impliedVol: null,
    delta: null,
    underlying_price: null
  }

  try {
    market_data = await get_market_data({ ib, contract })
  } catch (error) {
    log(
      `Error fetching realtime market data for ${symbol}:`,
      error.error ? error.error.toString() : error.toString()
    )
  }

  // If no realtime price available, get latest from database
  if (!market_data.price) {
    const latest_quote = await db('eod_equity_quotes')
      .select('c', 'quote_date')
      .where('symbol', symbol)
      .orderBy('quote_date', 'desc')
      .limit(1)
      .first()

    if (latest_quote) {
      const days_since_quote = dayjs().diff(
        dayjs(latest_quote.quote_date),
        'days'
      )
      if (days_since_quote > 2) {
        log(
          `Warning: Latest quote for ${symbol} is ${days_since_quote} days old`
        )
        // Import fresh historical data if quote is too old
        await refresh_historical_quotes({
          symbol,
          max_days_old: 2
        })

        // Get the updated quote after import
        const updated_quote = await db('eod_equity_quotes')
          .select('c', 'quote_date')
          .where('symbol', symbol)
          .orderBy('quote_date', 'desc')
          .limit(1)
          .first()

        if (updated_quote) {
          market_data.price = updated_quote.c
        } else {
          market_data.price = latest_quote.c
        }
      } else {
        market_data.price = latest_quote.c
      }
    } else {
      log(`No market data found in database for ${symbol}`)
      // Try to import historical data if no quote exists
      await refresh_historical_quotes({
        symbol,
        max_days_old: 2
      })

      // Check if we now have data after import
      const updated_quote = await db('eod_equity_quotes')
        .select('c', 'quote_date')
        .where('symbol', symbol)
        .orderBy('quote_date', 'desc')
        .limit(1)
        .first()

      if (updated_quote) {
        market_data.price = updated_quote.c
      }
    }
  }

  return market_data
}

const wait_for_service = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms))

const connect_ib_with_retry = async ({
  ib,
  max_retries = 5,
  initial_delay = 2000,
  max_delay = 10000
}) => {
  let current_delay = initial_delay
  let retry_count = 0

  while (retry_count < max_retries) {
    try {
      await wait_for_service(current_delay)
      await connect_ib(ib)
      log(
        `Successfully connected to IB Gateway after ${
          retry_count + 1
        } attempt(s)`
      )
      return
    } catch (error) {
      retry_count++
      if (retry_count === max_retries) {
        throw new Error(
          `Failed to connect after ${max_retries} attempts: ${error.message}`
        )
      }
      log(
        `Connection attempt ${retry_count} failed, retrying in ${
          current_delay / 1000
        }s...`
      )
      // Exponential backoff with max delay
      current_delay = Math.min(current_delay * 2, max_delay)
    }
  }
}

const connect_ib = (ib) =>
  new Promise((resolve, reject) => {
    const cleanup_listeners = []
    let timeout_id = null

    const connected_handler = () => {
      cleanup()
      resolve()
    }

    const error_handler = (err) => {
      cleanup()
      reject(err)
    }

    const cleanup = () => {
      cleanup_listeners.forEach((remove) => remove())
      if (timeout_id) {
        clearTimeout(timeout_id)
      }
    }

    cleanup_listeners.push(
      () => ib.api.off(EventName.connected, connected_handler),
      () => ib.api.off(EventName.error, error_handler)
    )

    ib.api.on(EventName.connected, connected_handler)
    ib.api.on(EventName.error, error_handler)

    ib.connect()

    // Set connection timeout
    timeout_id = setTimeout(() => {
      cleanup()
      reject(new Error('Connection timeout after 30 seconds'))
    }, 30000)
  })

export const get_account_info = async ({
  host,
  docker_port = 2375,
  ibkr_port = 4002,
  keep_alive = false
}) => {
  const containers = await get_docker_containers({ host, port: docker_port })
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

  const ib = new IBApiNext({
    host,
    port: ibkr_port
  })

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

    // Calculate option liabilities considering covered positions
    result.option_cash_liability = Math.abs(
      account_positions
        .filter(
          (position) => position.contract.secType === 'OPT' && position.pos < 0
        )
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
    )

    // Calculate in-the-money and out-of-the-money option liabilities
    result.option_cash_liability_in_the_money = Math.abs(
      positions_with_market_data
        .filter((position) => {
          // Check if option is in the money
          if (!position.market_data.underlying_price) return false

          if (position.contract.right === 'C') {
            return (
              position.market_data.underlying_price > position.contract.strike
            )
          } else {
            return (
              position.market_data.underlying_price < position.contract.strike
            )
          }
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
    )

    result.option_cash_liability_out_the_money = Math.abs(
      positions_with_market_data
        .filter((position) => {
          // Check if option is out of the money
          if (!position.market_data.underlying_price) return false

          if (position.contract.right === 'C') {
            return (
              position.market_data.underlying_price <= position.contract.strike
            )
          } else {
            return (
              position.market_data.underlying_price >= position.contract.strike
            )
          }
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
    )

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
    throw new Error(`Error fetching account info: ${error.message}`)
  }
}
