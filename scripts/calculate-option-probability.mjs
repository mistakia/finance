import debug from 'debug'
import yargs from 'yargs'
import dayjs from 'dayjs'
import { hideBin } from 'yargs/helpers'
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter.js'

import db from '#db'
// import config from '#config'
import { isMain } from '#common'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('calculate-option-probability')
debug.enable('calculate-option-probability')

dayjs.extend(isSameOrAfter)

const get_future_price = ({ prices, start_index, future_date }) => {
  for (let i = start_index; i < prices.length; i += 1) {
    const price = prices[i]
    if (dayjs(price.d).isSameOrAfter(future_date)) {
      return price
    }
  }
}

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

  const prices = await db('adjusted_daily_prices')
    .where({ symbol })
    .andWhere('d', '>=', `${start_year}-01-01`)
    .orderBy('d', 'asc')
  log({ prices: prices.length })
  let index = 0
  for (const price of prices) {
    const future_date = dayjs(price.d).add(days, 'day')
    const future_price = get_future_price({
      prices,
      future_date,
      start_index: index
    })

    if (!future_price) {
      index += 1
      continue
    }

    // calculate the change in price
    const change_in_price = future_price.c - price.c
    const change_in_price_percent = (change_in_price / price.c) * 100

    if (is_negative && change_in_price_percent < percent_change) {
      number_of_occurrences += 1
      occurences.push({ price, future_price, change_in_price_percent })
    } else if (!is_negative && change_in_price_percent > percent_change) {
      number_of_occurrences += 1
      occurences.push({ price, future_price, change_in_price_percent })
    }

    total_number_of_days += 1
    index += 1
  }

  // log(occurences)
  log(`Number of occurrences: ${number_of_occurrences}`)
  log(`Total number of days: ${total_number_of_days}`)
  log(`Probability: ${number_of_occurrences / total_number_of_days}`)
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
