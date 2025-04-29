import { IBApiNextTickType, IBApiTickType, MarketDataType } from '@stoqey/ib'
import debug from 'debug'
import dayjs from 'dayjs'
import db from '#db'
import refresh_historical_quotes from '../refresh-historical-quotes.mjs'
import { get_option_delta } from '../tradingview.mjs'

const log = debug('interactive-brokers:market-data')

export const get_market_data = async ({ ib, contract, delayed = false }) => {
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
          const delta = await get_option_delta({
            symbol: contract.symbol,
            expiration_date: parseInt(contract.lastTradeDateOrContractMonth),
            option_type: contract.right === 'C' ? 'call' : 'put',
            strike: parseFloat(contract.strike)
          })

          if (delta !== null) {
            market_data.delta = Math.abs(delta)
            log(
              `Retrieved delta for ${contract.symbol} ${contract.lastTradeDateOrContractMonth} ${contract.right} ${contract.strike} from TradingView: ${delta}`
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

export const get_stock_market_data = async ({ ib, symbol }) => {
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
