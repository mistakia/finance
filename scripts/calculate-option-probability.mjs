import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
// import config from '#config'
import { isMain } from '#libs-shared'
import { get_future_price_change } from '#libs-server'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('calculate-option-probability')
debug.enable('calculate-option-probability')

const calculate_option_probability = async ({
  symbol,
  days = 30,
  percent_change = 5,
  start_year = 1990,
  maxdrawdown_60 = Infinity,
  maxdrawdown_30 = Infinity,
  maxdrawdown_14 = Infinity,
  maxdrawdown_10 = Infinity,
  minrsi_14 = 0,
  maxrsi_14 = 100,
  minrsi_10 = 0,
  maxrsi_10 = 100,
  minrsi = minrsi_14,
  maxrsi = maxrsi_14,
  earnings = false,
  show_dates = false,
  min_cumulative_change_1 = -Infinity,
  max_cumulative_change_1 = Infinity,
  min_cumulative_change_5 = -Infinity,
  max_cumulative_change_5 = Infinity,
  min_cumulative_change_7 = -Infinity,
  max_cumulative_change_7 = Infinity,
  min_cumulative_change_10 = -Infinity,
  max_cumulative_change_10 = Infinity,
  min_cumulative_change_21 = -Infinity,
  max_cumulative_change_21 = Infinity,
  min_cumulative_change_42 = -Infinity,
  max_cumulative_change_42 = Infinity,
  min_cumulative_change_60 = -Infinity,
  max_cumulative_change_60 = Infinity,
  min_cumulative_change_200 = -Infinity,
  max_cumulative_change_200 = Infinity
} = {}) => {
  log({
    symbol,
    days,
    percent_change,
    start_year,
    maxdrawdown_60,
    maxdrawdown_30,
    maxdrawdown_14,
    maxdrawdown_10,
    minrsi_14,
    maxrsi_14,
    minrsi_10,
    maxrsi_10,
    minrsi,
    maxrsi,
    earnings,
    min_cumulative_change_1,
    max_cumulative_change_1,
    min_cumulative_change_5,
    max_cumulative_change_5,
    min_cumulative_change_7,
    max_cumulative_change_7,
    min_cumulative_change_10,
    max_cumulative_change_10,
    min_cumulative_change_21,
    max_cumulative_change_21,
    min_cumulative_change_42,
    max_cumulative_change_42,
    min_cumulative_change_60,
    max_cumulative_change_60,
    min_cumulative_change_200,
    max_cumulative_change_200
  })
  let number_of_occurrences = 0
  let total_number_of_days = 0
  const occurrences = []
  const is_negative = percent_change < 0
  let earnings_dates = []

  const prices = await db('end_of_day_equity_quotes')
    .where({ symbol })
    .andWhere('quote_date', '>=', `${start_year}-01-01`)
    .orderBy('quote_date', 'asc')

  if (earnings) {
    earnings_dates = await db('earnings')
      .where({ symbol })
      .andWhere('event_date', '>=', `${start_year}-01-01`)
      .orderBy('event_date', 'asc')

    if (!earnings_dates.length) {
      log(`No earnings dates found for ${symbol}`)
      return
    }
  }

  let index = 0

  for (const price of prices) {
    if (price.maxdrawdown_60 > maxdrawdown_60) {
      continue
    }

    if (price.maxdrawdown_30 > maxdrawdown_30) {
      continue
    }

    if (price.maxdrawdown_14 > maxdrawdown_14) {
      continue
    }

    if (price.maxdrawdown_10 > maxdrawdown_10) {
      continue
    }

    if (price.relative_strength_index_14 < minrsi) {
      continue
    }

    if (price.relative_strength_index_14 > maxrsi) {
      continue
    }

    if (price.relative_strength_index_10 < minrsi_10) {
      continue
    }

    if (price.relative_strength_index_10 > maxrsi_10) {
      continue
    }

    if (price.relative_strength_index_14 < minrsi_14) {
      continue
    }

    if (price.relative_strength_index_14 > maxrsi_14) {
      continue
    }

    // Check cumulative changes
    if (
      price.cumulative_change_1 < min_cumulative_change_1 ||
      price.cumulative_change_1 > max_cumulative_change_1
    ) {
      continue
    }

    if (
      price.cumulative_change_5 < min_cumulative_change_5 ||
      price.cumulative_change_5 > max_cumulative_change_5
    ) {
      continue
    }

    if (
      price.cumulative_change_7 < min_cumulative_change_7 ||
      price.cumulative_change_7 > max_cumulative_change_7
    ) {
      continue
    }

    if (
      price.cumulative_change_10 < min_cumulative_change_10 ||
      price.cumulative_change_10 > max_cumulative_change_10
    ) {
      continue
    }

    if (
      price.cumulative_change_21 < min_cumulative_change_21 ||
      price.cumulative_change_21 > max_cumulative_change_21
    ) {
      continue
    }

    if (
      price.cumulative_change_42 < min_cumulative_change_42 ||
      price.cumulative_change_42 > max_cumulative_change_42
    ) {
      continue
    }

    if (
      price.cumulative_change_60 < min_cumulative_change_60 ||
      price.cumulative_change_60 > max_cumulative_change_60
    ) {
      continue
    }

    if (
      price.cumulative_change_200 < min_cumulative_change_200 ||
      price.cumulative_change_200 > max_cumulative_change_200
    ) {
      continue
    }

    if (earnings) {
      const earnings_date_within_range = earnings_dates.find(
        (earnings_date) => {
          const event_date = new Date(earnings_date.event_date)
          const quote_date = new Date(price.quote_date)
          const quote_date_plus_days = new Date(quote_date)
          quote_date_plus_days.setDate(quote_date_plus_days.getDate() + days)
          return event_date >= quote_date && event_date <= quote_date_plus_days
        }
      )

      if (!earnings_date_within_range) {
        continue
      }
    }

    const on_finish = ({ count_day = false } = {}) => {
      index += 1

      if (count_day) {
        total_number_of_days += 1
      }
    }

    const on_occurence = (future_price_change) => {
      number_of_occurrences += 1
      occurrences.push({
        price,
        future_price_change
      })
    }

    const change_in_x_days = get_future_price_change({
      prices,
      price,
      days,
      index
    })

    if (!change_in_x_days.pct) {
      on_finish()
      continue
    }

    if (is_negative && change_in_x_days.pct < percent_change) {
      on_occurence(change_in_x_days)
    } else if (!is_negative && change_in_x_days.pct > percent_change) {
      on_occurence(change_in_x_days)
    }

    on_finish({ count_day: true })
  }

  // log(occurrences)
  log(`Number of occurrences: ${number_of_occurrences}`)
  log(`Total number of days: ${total_number_of_days}`)
  log(`Probability: ${number_of_occurrences / total_number_of_days}`)

  if (show_dates) {
    const sorted_occurrences = occurrences.sort((a, b) => {
      return a.future_price_change.pct - b.future_price_change.pct
    })
    log(sorted_occurrences.splice(0, 10))
  }

  // TODO get min, max, average rsi value on occurrences
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
      percent_change: argv.percent,
      maxdrawdown_60: argv.maxdrawdown_60,
      maxdrawdown_30: argv.maxdrawdown_30,
      maxdrawdown_14: argv.maxdrawdown_14,
      maxdrawdown_10: argv.maxdrawdown_10,
      minrsi_14: argv.minrsi_14,
      maxrsi_14: argv.maxrsi_14,
      minrsi_10: argv.minrsi_10,
      maxrsi_10: argv.maxrsi_10,
      minrsi: argv.minrsi,
      maxrsi: argv.maxrsi,
      earnings: argv.earnings,
      show_dates: argv.show_dates,
      min_cumulative_change_1: argv.min_cumulative_change_1,
      max_cumulative_change_1: argv.max_cumulative_change_1,
      min_cumulative_change_5: argv.min_cumulative_change_5,
      max_cumulative_change_5: argv.max_cumulative_change_5,
      min_cumulative_change_7: argv.min_cumulative_change_7,
      max_cumulative_change_7: argv.max_cumulative_change_7,
      min_cumulative_change_10: argv.min_cumulative_change_10,
      max_cumulative_change_10: argv.max_cumulative_change_10,
      min_cumulative_change_21: argv.min_cumulative_change_21,
      max_cumulative_change_21: argv.max_cumulative_change_21,
      min_cumulative_change_42: argv.min_cumulative_change_42,
      max_cumulative_change_42: argv.max_cumulative_change_42,
      min_cumulative_change_60: argv.min_cumulative_change_60,
      max_cumulative_change_60: argv.max_cumulative_change_60,
      min_cumulative_change_200: argv.min_cumulative_change_200,
      max_cumulative_change_200: argv.max_cumulative_change_200
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
