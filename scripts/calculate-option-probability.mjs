import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
// import config from '#config'
import { isMain } from '#common'
import { get_future_price_change } from '#libs-server'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('calculate-option-probability')
debug.enable('calculate-option-probability')

const calculate_option_probability = async ({
  symbol,
  days = 30,
  percent_change = 5,
  start_year = 1990
} = {}) => {
  log({ symbol, days, percent_change, start_year })
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
