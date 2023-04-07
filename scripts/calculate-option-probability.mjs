import debug from 'debug'
import yargs from 'yargs'
import dayjs from 'dayjs'
import { hideBin } from 'yargs/helpers'
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter.js'
import { SuperTrend, RSI, WMA } from '@debut/indicators'
// import {
//   isBullishHammer,
//   isBearishHammer,
//   isBearishInvertedHammer,
//   isBearishEngulfing,
//   isBearishHarami,
//   isBearishKicker
// } from 'candlestick'

import db from '#db'
// import config from '#config'
import { isMain } from '#common'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('calculate-option-probability')
debug.enable('calculate-option-probability')

dayjs.extend(isSameOrAfter)

const get_future_price = ({ prices, index, future_date }) => {
  for (let i = index; i < prices.length; i += 1) {
    const price = prices[i]
    if (dayjs(price.quote_date).isSameOrAfter(future_date)) {
      return price
    }
  }
}

const get_future_price_change = ({ prices, price, index, days }) => {
  const future_date = dayjs(price.quote_date).add(days, 'day')
  const future_price = get_future_price({
    prices,
    future_date,
    index
  })

  if (!future_price) {
    return {
      c: null,
      d: null,
      pct: null
    }
  }

  // calculate the change in price
  const change_in_price = future_price.c - price.c
  const change_in_price_percent = (change_in_price / price.c) * 100

  return {
    c: future_price.c,
    d: future_price.quote_date,
    pct: change_in_price_percent
  }
}

// const is_bullish_candle = ({ prev, curr }) => {
//   if (isBullishHammer(curr)) {
//     return true
//   }

//   return false
// }

// const is_bearish_candle = ({ prev, curr }) => {
//   // if (isBearishHammer(curr)) {
//   //   return true
//   // }

//   // if (isBearishInvertedHammer(curr)) {
//   //   return true
//   // }

//   if (isBearishEngulfing(curr, prev)) {
//     return true
//   }

//   // if (isBearishHarami(curr, prev)) {
//   //   return true
//   // }

//   if (isBearishKicker(curr, prev)) {
//     return true
//   }

//   return false
// }

const calculate_option_probability = async ({
  symbol,
  days = 30,
  percent_change = 5,
  start_year = 1990
} = {}) => {
  log({ symbol, days, percent_change, start_year })
  // let number_of_occurrences = 0
  // let total_number_of_days = 0
  // const occurences = []
  // const is_negative = percent_change < 0

  const supertrend_indicator = new SuperTrend()
  const rsi_indicator = new RSI()
  const wma_indicator = new WMA(9)

  const indicator_results = () => ({
    last_value: null,
    current_value: null
  })

  const prices = await db('adjusted_daily_prices')
    .where({ symbol })
    .andWhere('d', '>=', `${start_year}-01-01`)
    .orderBy('d', 'asc')

  let index = 0
  const supertrend = indicator_results()
  const rsi = indicator_results()
  const wma = indicator_results()
  // let last_bearish_candle = null

  const inserts = []

  for (const price of prices) {
    const on_finish = () => {
      // {
      // count_day = false
      // is_bearish = false
      // } = {}

      supertrend.last_value = supertrend.current_value
      rsi.last_value = rsi.current_value
      wma.last_value = wma.current_value
      index += 1

      // if (is_bearish) {
      //   last_bearish_candle = price.quote_date
      // }

      // if (count_day) {
      //   total_number_of_days += 1
      // }
    }

    // const on_occurence = () => {
    //   number_of_occurrences += 1
    //   occurences.push({
    //     price,
    //     future_price,
    //     change_in_price_percent,
    //     indicators: JSON.parse(JSON.stringify({ supertrend, rsi }))
    //   })
    // }

    // check if its been more than x days since the last bearish candle
    // if (last_bearish_candle) {
    //   const last_bearish_date = dayjs(last_bearish_candle)
    //   const current_date = dayjs(price.quote_date)
    //   const diff = current_date.diff(last_bearish_date, 'day')
    //   if (diff < 70) {
    //     on_finish()
    //     continue
    //   }
    // }

    wma.current_value = wma_indicator.nextValue(price.c)
    rsi.current_value = rsi_indicator.nextValue(price.c)
    supertrend.current_value = supertrend_indicator.nextValue(
      price.h,
      price.l,
      price.c
    )

    // if (rsi.current_value > 29) {
    //   on_finish()
    //   continue
    // }

    // if (supertrend.current_value && supertrend.current_value.direction < 0) {
    //   on_finish()
    //   continue
    // }

    const previous = prices[index - 1]
    if (!previous) {
      on_finish()
      continue
    }

    // const prev = {
    //   open: previous.o,
    //   close: previous.c,
    //   high: previous.h,
    //   low: previous.l
    // }

    // const curr = {
    //   open: price.o,
    //   close: price.c,
    //   high: price.h,
    //   low: price.l
    // }

    // const is_bullish = is_bullish_candle({ prev, curr })
    // const is_bearish = is_bearish_candle({ prev, curr })

    // if (is_bearish) {
    //   on_finish({ is_bearish: true })
    //   continue
    // }

    // const change_in_x_days = get_future_price_change({ prices, price, days, index })

    // if (!change_in_x_days.pct) {
    //   on_finish()
    //   continue
    // }

    // if (is_negative && change_in_x_days < percent_change) {
    //   on_occurence()
    // } else if (!is_negative && change_in_x_days > percent_change) {
    //   on_occurence()
    // }

    const wma_diff_pct = wma.current_value
      ? ((price.c - wma.current_value) / wma.current_value) * 100
      : null

    const change_in_7d = get_future_price_change({
      prices,
      price,
      days: 7,
      index
    })
    const change_in_14d = get_future_price_change({
      prices,
      price,
      days: 14,
      index
    })
    const change_in_30d = get_future_price_change({
      prices,
      price,
      days: 30,
      index
    })
    const change_in_40d = get_future_price_change({
      prices,
      price,
      days: 40,
      index
    })

    inserts.push({
      ...price,

      change_in_7d: change_in_7d.pct,
      change_in_14d: change_in_14d.pct,
      change_in_30d: change_in_30d.pct,
      change_in_40d: change_in_40d.pct,

      wma_diff_pct,
      rsi: rsi.current_value
    })

    on_finish({ count_day: true })
  }

  // log(occurences)
  // log(`Number of occurrences: ${number_of_occurrences}`)
  // log(`Total number of days: ${total_number_of_days}`)
  // log(`Probability: ${number_of_occurrences / total_number_of_days}`)

  // get min, max, average rsi value on occurences
  // const rsi_values = occurences.map(
  //   (occurence) => occurence.indicators.rsi.current_value
  // )
  // const rsi_min = Math.min(...rsi_values)
  // const rsi_max = Math.max(...rsi_values)
  // const rsi_avg = rsi_values.reduce((a, b) => a + b, 0) / rsi_values.length
  // log({ rsi_min, rsi_max, rsi_avg })

  await db('eod_equity_quotes').insert(inserts).onConflict().merge()
}

const main = async () => {
  let error
  try {
    const symbol = argv.symbol
    if (!symbol) {
      throw new Error('Missing --symbol')
    }

    await calculate_option_probability({
      symbol,
      start_year: argv.start,
      days: argv.days,
      percent_change: argv.percent
    })
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

export default calculate_option_probability
