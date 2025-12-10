import { IBApiNextTickType, IBApiTickType, MarketDataType } from '@stoqey/ib'
import debug from 'debug'
import dayjs from 'dayjs'
import db from '#db'
import refresh_historical_quotes from '../refresh-historical-quotes.mjs'
import { get_option_market_data } from '../tradingview.mjs'

const log = debug('interactive-brokers:market-data')

export const get_market_data = async ({ ib, contract, delayed = false }) => {
  return new Promise((resolve, reject) => {
    let market_data = {
      price: null,
      bid: null,
      ask: null,
      impliedVol: null,
      delta: null,
      theta: null,
      gamma: null,
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

      // For options: if missing price or delta, try to get full market data from TradingView
      if (
        contract.secType === 'OPT' &&
        (!market_data.price || market_data.delta === null)
      ) {
        try {
          const tv_data = await get_option_market_data({
            symbol: contract.symbol,
            expiration_date: parseInt(contract.lastTradeDateOrContractMonth),
            option_type: contract.right === 'C' ? 'call' : 'put',
            strike: parseFloat(contract.strike)
          })

          if (tv_data) {
            // Fill in missing values from TradingView
            if (!market_data.price && tv_data.price) {
              market_data.price = tv_data.price
            }
            if (!market_data.bid && tv_data.bid) {
              market_data.bid = tv_data.bid
            }
            if (!market_data.ask && tv_data.ask) {
              market_data.ask = tv_data.ask
            }
            if (market_data.delta === null && tv_data.delta !== null) {
              market_data.delta = Math.abs(tv_data.delta)
            }
            if (market_data.theta === null && tv_data.theta !== null) {
              market_data.theta = tv_data.theta
            }
            if (market_data.gamma === null && tv_data.gamma !== null) {
              market_data.gamma = tv_data.gamma
            }
            if (
              market_data.impliedVol === null &&
              tv_data.impliedVol !== null
            ) {
              market_data.impliedVol = tv_data.impliedVol
            }

            if (tv_data.price || tv_data.delta) {
              log(
                `Retrieved option data for ${contract.symbol} ${
                  contract.lastTradeDateOrContractMonth
                } ${contract.right} ${
                  contract.strike
                } from TradingView: price=${
                  tv_data.price?.toFixed(2) || 'N/A'
                } delta=${tv_data.delta?.toFixed(4) || 'N/A'}`
              )
            }
          }
        } catch (error) {
          log(`Failed to get option data from TradingView: ${error.message}`)
        }
      }

      if (!has_received_data && !market_data.price) {
        log(
          `No market data received for contract: ${JSON.stringify(
            contract_with_exchange
          )}`
        )
      } else if (market_data.price) {
        log(
          `Final market data for ${contract.symbol} ${contract.strike || ''} ${
            contract.right || ''
          }: ` +
            `price=${market_data.price?.toFixed(2) || 'NULL'} ` +
            `bid=${market_data.bid?.toFixed(2) || 'NULL'} ` +
            `ask=${market_data.ask?.toFixed(2) || 'NULL'} ` +
            `delta=${market_data.delta?.toFixed(4) || 'NULL'} ` +
            `theta=${market_data.theta?.toFixed(4) || 'NULL'}`
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

          // Extract option-specific data (greeks)
          const model_delta =
            update_data.get('MODEL_OPTION_DELTA') ||
            update_data.get('DELAYED_MODEL_OPTION_DELTA')
          const model_iv =
            update_data.get('MODEL_OPTION_IV') ||
            update_data.get('DELAYED_MODEL_OPTION_IV')
          const model_theta =
            update_data.get('MODEL_OPTION_THETA') ||
            update_data.get('DELAYED_MODEL_OPTION_THETA')
          const model_gamma =
            update_data.get('MODEL_OPTION_GAMMA') ||
            update_data.get('DELAYED_MODEL_OPTION_GAMMA')

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

          if (model_delta || model_iv || price || bid_price || ask_price) {
            market_data = {
              ...market_data,
              delta: model_delta ? Math.abs(model_delta) : market_data.delta,
              theta: model_theta || market_data.theta,
              gamma: model_gamma || market_data.gamma,
              impliedVol: model_iv || market_data.impliedVol,
              price: price || market_data.price,
              bid: bid_price || market_data.bid,
              ask: ask_price || market_data.ask
            }
            has_received_data = true

            log(
              `Market data for ${contract.symbol} ${contract.strike || ''} ${
                contract.right || ''
              }: ` +
                `price=${price?.toFixed(2) || '-'} bid=${
                  bid_price?.toFixed(2) || '-'
                } ask=${ask_price?.toFixed(2) || '-'} ` +
                `delta=${model_delta?.toFixed(4) || '-'} theta=${
                  model_theta?.toFixed(4) || '-'
                } gamma=${model_gamma?.toFixed(4) || '-'}`
            )

            // If we have all the data we need, resolve immediately
            if (
              market_data.price &&
              market_data.delta &&
              market_data.impliedVol &&
              market_data.bid &&
              market_data.ask
            ) {
              cleanup_and_resolve()
            }
          }
        },
        error: (err) => {
          // Log only the message for known/expected errors, full error for unexpected ones
          // 10089: Market data requires subscription
          // 10090: Market data subscription errors
          // 10091: Part of requested market data requires subscription
          const known_error_codes = [10089, 10090, 10091]
          if (err.code && known_error_codes.includes(err.code)) {
            log(`Market data error (${err.code}): ${err.message}`)
          } else {
            log('Error receiving market data:', err)
          }
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
    bid: null,
    ask: null,
    impliedVol: null,
    delta: null,
    theta: null,
    gamma: null,
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
    const latest_quote = await db('end_of_day_equity_quotes')
      .select('close_price', 'quote_date')
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
        const updated_quote = await db('end_of_day_equity_quotes')
          .select('close_price', 'quote_date')
          .where('symbol', symbol)
          .orderBy('quote_date', 'desc')
          .limit(1)
          .first()

        if (updated_quote) {
          market_data.price = parseFloat(updated_quote.close_price)
        } else {
          market_data.price = parseFloat(latest_quote.close_price)
        }
      } else {
        market_data.price = parseFloat(latest_quote.close_price)
      }
    } else {
      log(`No market data found in database for ${symbol}`)
      // Try to import historical data if no quote exists
      await refresh_historical_quotes({
        symbol,
        max_days_old: 2
      })

      // Check if we now have data after import
      const updated_quote = await db('end_of_day_equity_quotes')
        .select('close_price', 'quote_date')
        .where('symbol', symbol)
        .orderBy('quote_date', 'desc')
        .limit(1)
        .first()

      if (updated_quote) {
        market_data.price = parseFloat(updated_quote.close_price)
      }
    }
  }

  return market_data
}
