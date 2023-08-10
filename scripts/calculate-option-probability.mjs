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
  minrsi = 0,
  maxrsi = 100
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
    minrsi,
    maxrsi
  })
  let number_of_occurrences = 0
  let total_number_of_days = 0
  const occurences = []
  const is_negative = percent_change < 0

  const prices = await db('eod_equity_quotes')
    .where({ symbol })
    .andWhere('quote_date', '>=', `${start_year}-01-01`)
    .orderBy('quote_date', 'asc')

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

    const on_finish = ({ count_day = false } = {}) => {
      index += 1

      if (count_day) {
        total_number_of_days += 1
      }
    }

    const on_occurence = (future_price_change) => {
      number_of_occurrences += 1
      occurences.push({
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

  // log(occurences)
  log(`Number of occurrences: ${number_of_occurrences}`)
  log(`Total number of days: ${total_number_of_days}`)
  log(`Probability: ${number_of_occurrences / total_number_of_days}`)

  // const sorted_occurences = occurences.sort((a, b) => {
  //   return a.future_price_change.pct - b.future_price_change.pct
  // })
  // log(sorted_occurences.splice(0, 10))

  // TODO get min, max, average rsi value on occurences
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
      minrsi: argv.minrsi,
      maxrsi: argv.maxrsi
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
