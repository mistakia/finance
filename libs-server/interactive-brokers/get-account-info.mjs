import debug from 'debug'

import {
  start_docker_container,
  stop_docker_container,
  get_docker_containers
} from './docker.mjs'
import { create_ib_client, connect_ib_with_retry } from './connection.mjs'
import {
  get_account_summary,
  get_account_positions
} from './client/raw-data.mjs'
import { get_stock_market_data, get_market_data } from './market-data.mjs'
import {
  group_positions_by_symbol,
  enrich_with_market_data,
  calculate_basic_metrics,
  create_position_summary
} from './analysis/base.mjs'
import {
  analyze_position_risk,
  calculate_total_liability,
  calculate_delta_exposure
} from './analysis/risk.mjs'
import { identify_strategies } from './analysis/strategy.mjs'
import {
  analyze_probability_risk,
  calculate_expected_value
} from './analysis/probability.mjs'
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

    // 1. FETCH RAW DATA
    log('Fetching account positions...')
    const account_positions = await get_account_positions(ib)

    log('Fetching account summary...')
    const account_summary = await get_account_summary(ib)

    // 2. GROUP POSITIONS BY SYMBOL (Base Analysis)
    log('Performing base analysis...')
    const symbols_map = group_positions_by_symbol(account_positions)

    // 3. FETCH MARKET DATA
    // Prepare market data maps
    const stock_market_data = new Map()
    const option_market_data = new Map()

    // Fetch stock market data
    log('Fetching stock market data...')
    // eslint-disable-next-line no-unused-vars
    for (const [symbol, _] of symbols_map) {
      try {
        const market_data = await get_stock_market_data({ ib, symbol })
        stock_market_data.set(symbol, market_data)
      } catch (error) {
        log(`Error fetching market data for ${symbol}:`, error)
      }
    }

    // Fetch option market data for short positions
    log('Fetching option market data...')
    // eslint-disable-next-line no-unused-vars
    for (const [_, symbol_data] of symbols_map) {
      for (const position of symbol_data.option_positions) {
        if (position.pos < 0) {
          // Only fetch data for short positions
          try {
            const market_data = await get_market_data({
              ib,
              contract: position.contract
            })
            option_market_data.set(position.contract.conId, market_data)
          } catch (error) {
            log(
              `Error fetching option market data for ${position.contract.symbol}:`,
              error
            )
          }
        }
      }
    }

    // 4. ENRICH BASE ANALYSIS WITH MARKET DATA
    log('Enriching position data with market data...')
    const enriched_symbols = enrich_with_market_data({
      symbols_map,
      stock_market_data,
      option_market_data
    })

    // 5. CALCULATE BASIC METRICS
    log('Calculating basic position metrics...')
    const { symbols_map: symbols_with_metrics, metrics } =
      calculate_basic_metrics(enriched_symbols)

    // 6. PERFORM SPECIALIZED ANALYSIS
    log('Analyzing position risk...')
    const risk_analysis = analyze_position_risk(symbols_with_metrics)

    log('Calculating total liability...')
    const total_liability = calculate_total_liability(risk_analysis)

    log('Analyzing delta exposure...')
    const delta_exposure = calculate_delta_exposure(symbols_with_metrics)

    log('Identifying option strategies...')
    const strategies = identify_strategies(symbols_with_metrics)

    log('Analyzing probability-based risk...')
    const probability_analysis = analyze_probability_risk(symbols_with_metrics)

    log('Calculating expected values...')
    const expected_value = calculate_expected_value(symbols_with_metrics)

    // 7. PREPARE RESULT OBJECT WITH RAW AND ANALYZED DATA
    const result = {
      // Raw data
      raw: {
        positions: account_positions,
        summary: Object.fromEntries(account_summary)
      },

      // Summary data
      summary: Object.fromEntries(account_summary),

      // Base position data
      positions: create_position_summary(account_positions),

      // Analysis results
      analysis: {
        // Basic metrics
        metrics,

        // Risk analysis
        risk: {
          ...risk_analysis,
          total: total_liability,
          delta_exposure
        },

        // Strategy analysis
        strategies,

        // Probability analysis
        probability: probability_analysis,
        expected_value: {
          total: expected_value.total_expected_value,
          by_symbol: Array.from(expected_value.by_symbol.values())
        },

        // Symbol-based analysis
        symbols: Array.from(symbols_with_metrics.values()).map((symbol) => ({
          symbol: symbol.symbol,
          total_shares: symbol.total_shares,
          short_calls: symbol.short_calls.length,
          short_puts: symbol.short_puts.length,
          market_price: symbol.market_data?.price || null,
          delta_exposure:
            delta_exposure.by_symbol.get(symbol.symbol)?.delta_dollars || 0
        }))
      }
    }

    log('Disconnecting from Interactive Brokers...')
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
