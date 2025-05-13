import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { RSI, SMA, ATR, WMA, ROC } from '@debut/indicators'
import BigNumber from 'bignumber.js'

import db from '#db'
// import config from '#config'
import { isMain } from '#libs-shared'
import {
  get_future_price_change,
  HistoricalVolatility,
  MaxDrawdown,
  chunk_inserts
} from '#libs-server'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('calculate-equity-metrics')
debug.enable('calculate-equity-metrics')

const calculate_equity_metrics = async ({ symbol }) => {
  const rsi_14 = new RSI(14)
  const rsi_10 = new RSI(10)
  const sma_125 = new SMA(125)
  const sma_14 = new SMA(14)
  const atr_14 = new ATR(14, 'WEMA')
  const wma_9 = new WMA(9)

  const hv_2 = new HistoricalVolatility(2)
  const hv_7 = new HistoricalVolatility(7)
  const hv_10 = new HistoricalVolatility(10)
  const hv_14 = new HistoricalVolatility(14)
  const hv_30 = new HistoricalVolatility(30)

  const hv_2_sma_9 = new SMA(9)
  const hv_10_sma_9 = new SMA(9)
  const hv_30_sma_9 = new SMA(9)

  const maxdraw_10 = new MaxDrawdown(10)
  const maxdraw_14 = new MaxDrawdown(14)
  const maxdraw_30 = new MaxDrawdown(30)
  const maxdraw_60 = new MaxDrawdown(60)

  const roc_1 = new ROC(1)
  const roc_5 = new ROC(5)
  const roc_7 = new ROC(7)
  const roc_10 = new ROC(10)
  const roc_21 = new ROC(21)
  const roc_42 = new ROC(42)
  const roc_60 = new ROC(60)
  const roc_200 = new ROC(200)

  const metrics = {
    change_in_1d: null,
    change_in_7d: null,
    change_in_14d: null,
    change_in_30d: null,
    change_in_40d: null,

    relative_strength_index_14: null,
    relative_strength_index_10: null,
    moving_average_14: null,
    moving_average_125: null,
    average_true_range_14_normalized: null,
    weighted_moving_average_9: null,
    weighted_moving_average_diff_pct: null,

    trailing_volatility_2: null,
    trailing_volatility_7: null,
    trailing_volatility_10: null,
    trailing_volatility_14: null,
    trailing_volatility_30: null,

    trailing_volatility_2_moving_average_9: null,
    trailing_volatility_2_moving_average_9_change_pct: null,
    trailing_volatility_2_moving_average_9_diff_pct: null,

    trailing_volatility_10_moving_average_9: null,
    trailing_volatility_10_moving_average_9_change_pct: null,
    trailing_volatility_10_moving_average_9_diff_pct: null,

    trailing_volatility_30_moving_average_9: null,
    trailing_volatility_30_moving_average_9_change_pct: null,
    trailing_volatility_30_moving_average_9_diff_pct: null,

    maxdrawdown_10: null,
    maxdrawdown_14: null,
    maxdrawdown_30: null,
    maxdrawdown_60: null,

    cumulative_change_1: null,
    cumulative_change_5: null,
    cumulative_change_7: null,
    cumulative_change_10: null,
    cumulative_change_21: null,
    cumulative_change_42: null,
    cumulative_change_60: null,
    cumulative_change_200: null
  }

  const quotes = await db('end_of_day_equity_quotes')
    .where({ symbol })
    .orderBy('quote_unix_timestamp', 'asc')

  const inserts = []
  let index = 0

  for (const quote of quotes) {
    metrics.change_in_1d = get_future_price_change({
      prices: quotes,
      price: quote,
      days: 1,
      index
    }).pct
    metrics.change_in_7d = get_future_price_change({
      prices: quotes,
      price: quote,
      days: 7,
      index
    }).pct
    metrics.change_in_14d = get_future_price_change({
      prices: quotes,
      price: quote,
      days: 14,
      index
    }).pct
    metrics.change_in_30d = get_future_price_change({
      prices: quotes,
      price: quote,
      days: 30,
      index
    }).pct
    metrics.change_in_40d = get_future_price_change({
      prices: quotes,
      price: quote,
      days: 40,
      index
    }).pct

    metrics.relative_strength_index_14 =
      rsi_14.nextValue(quote.close_price) || null
    metrics.relative_strength_index_10 =
      rsi_10.nextValue(quote.close_price) || null
    metrics.moving_average_14 = sma_14.nextValue(quote.close_price)
    metrics.moving_average_125 = sma_125.nextValue(quote.close_price)
    metrics.average_true_range_14_normalized =
      BigNumber(
        atr_14.nextValue(quote.high_price, quote.low_price, quote.close_price)
      )
        .dividedBy(metrics.moving_average_14)
        .multipliedBy(100)
        .toNumber() || null
    metrics.weighted_moving_average_9 = wma_9.nextValue(quote.close_price)
    metrics.weighted_moving_average_diff_pct = metrics.weighted_moving_average_9
      ? ((quote.close_price - metrics.weighted_moving_average_9) /
          metrics.weighted_moving_average_9) *
        100
      : null

    metrics.trailing_volatility_2 = hv_2.next_value(quote.close_price)
    metrics.trailing_volatility_7 = hv_7.next_value(quote.close_price)
    metrics.trailing_volatility_10 = hv_10.next_value(quote.close_price)
    metrics.trailing_volatility_14 = hv_14.next_value(quote.close_price)
    metrics.trailing_volatility_30 = hv_30.next_value(quote.close_price)

    metrics.trailing_volatility_2_moving_average_9 = hv_2_sma_9.nextValue(
      metrics.trailing_volatility_2
    )
    const prev_trailing_volatility_2_moving_average_9 =
      inserts[index - 1]?.trailing_volatility_2_moving_average_9
    metrics.trailing_volatility_2_moving_average_9_change_pct =
      prev_trailing_volatility_2_moving_average_9
        ? ((metrics.trailing_volatility_2_moving_average_9 -
            prev_trailing_volatility_2_moving_average_9) /
            prev_trailing_volatility_2_moving_average_9) *
          100
        : null
    metrics.trailing_volatility_2_moving_average_9_diff_pct =
      metrics.trailing_volatility_2_moving_average_9
        ? ((metrics.trailing_volatility_2 -
            metrics.trailing_volatility_2_moving_average_9) /
            metrics.trailing_volatility_2_moving_average_9) *
          100
        : null

    metrics.trailing_volatility_10_moving_average_9 = hv_10_sma_9.nextValue(
      metrics.trailing_volatility_10
    )
    const prev_trailing_volatility_10_moving_average_9 =
      inserts[index - 1]?.trailing_volatility_10_moving_average_9
    metrics.trailing_volatility_10_moving_average_9_change_pct =
      prev_trailing_volatility_10_moving_average_9
        ? ((metrics.trailing_volatility_10_moving_average_9 -
            prev_trailing_volatility_10_moving_average_9) /
            prev_trailing_volatility_10_moving_average_9) *
          100
        : null
    metrics.trailing_volatility_10_moving_average_9_diff_pct =
      metrics.trailing_volatility_10_moving_average_9
        ? ((metrics.trailing_volatility_10 -
            metrics.trailing_volatility_10_moving_average_9) /
            metrics.trailing_volatility_10_moving_average_9) *
          100
        : null

    metrics.trailing_volatility_30_moving_average_9 = hv_30_sma_9.nextValue(
      metrics.trailing_volatility_30
    )
    const prev_trailing_volatility_30_moving_average_9 =
      inserts[index - 1]?.trailing_volatility_30_moving_average_9
    metrics.trailing_volatility_30_moving_average_9_change_pct =
      prev_trailing_volatility_30_moving_average_9
        ? ((metrics.trailing_volatility_30_moving_average_9 -
            prev_trailing_volatility_30_moving_average_9) /
            prev_trailing_volatility_30_moving_average_9) *
          100
        : null
    metrics.trailing_volatility_30_moving_average_9_diff_pct =
      metrics.trailing_volatility_30_moving_average_9
        ? ((metrics.trailing_volatility_30 -
            metrics.trailing_volatility_30_moving_average_9) /
            metrics.trailing_volatility_30_moving_average_9) *
          100
        : null

    metrics.maxdrawdown_10 = maxdraw_10.nextValue(quote.close_price)
    metrics.maxdrawdown_14 = maxdraw_14.nextValue(quote.close_price)
    metrics.maxdrawdown_30 = maxdraw_30.nextValue(quote.close_price)
    metrics.maxdrawdown_60 = maxdraw_60.nextValue(quote.close_price)

    metrics.cumulative_change_1 = roc_1.nextValue(quote.close_price)
    metrics.cumulative_change_5 = roc_5.nextValue(quote.close_price)
    metrics.cumulative_change_7 = roc_7.nextValue(quote.close_price)
    metrics.cumulative_change_10 = roc_10.nextValue(quote.close_price)
    metrics.cumulative_change_21 = roc_21.nextValue(quote.close_price)
    metrics.cumulative_change_42 = roc_42.nextValue(quote.close_price)
    metrics.cumulative_change_60 = roc_60.nextValue(quote.close_price)
    metrics.cumulative_change_200 = roc_200.nextValue(quote.close_price)

    inserts.push({
      ...quote,
      ...metrics
    })

    index += 1
  }

  if (inserts.length) {
    await chunk_inserts({
      inserts,
      chunk_size: 1000,
      save: async (chunk) => {
        await db('end_of_day_equity_quotes')
          .insert(chunk)
          .onConflict(['symbol', 'quote_date'])
          .merge()
      }
    })
    log(`Inserted ${inserts.length} rows into end_of_day_equity_quotes`)
  }
}

const main = async () => {
  let error
  try {
    if (!argv.symbol) {
      throw new Error('Missing --symbol')
    }

    await calculate_equity_metrics({ symbol: argv.symbol })
  } catch (err) {
    error = err
    console.log(error)
  }

  /* await db('jobs').insert({
   *   type: constants.jobs.EXAMPLE,
   *   succ: error ? 0 : 1,
   *   reason: error ? error.message : null,
   *   timestamp: Math.round(Date.now() / 1000)
   * })
   */
  process.exit()
}

if (isMain(import.meta.url)) {
  main()
}

export default calculate_equity_metrics
