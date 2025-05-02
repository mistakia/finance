import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter.js'
import dayjs from 'dayjs'

import db from '#db'
// import config from '#config'
import { isMain } from '#libs-shared'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('calculate-option-metrics')
debug.enable('calculate-option-metrics')

dayjs.extend(isSameOrAfter)

const get_underylying_price_at_date = ({ underlying_eod_quotes, date }) => {
  for (let i = 0; i < underlying_eod_quotes.length; i += 1) {
    const eod_quote = underlying_eod_quotes[i]
    if (dayjs(eod_quote.quote_date).isSameOrAfter(date)) {
      return eod_quote.close_price || null
    }
  }

  return null
}

const calculate_option_metrics = async ({ symbol }) => {
  log(`Calculating option metrics for options on ${symbol}...`)

  const batchSize = 100000
  let offset = 0

  while (true) {
    // retrieve the next batch of option quotes
    const batch = await db('eod_option_quotes')
      .where({ underlying_symbol: symbol })
      .orderBy('quote_unix_timestamp', 'asc')
      .limit(batchSize)
      .offset(offset)
    offset += batchSize

    // stop if there are no more rows to process
    if (batch.length === 0) {
      break
    }

    log(
      `Processing ${batch.length} rows for ${symbol} starting at ${batch[0].quote_date}`
    )

    const underlying_eod_quotes = await db('end_of_day_equity_quotes')
      .where({ symbol })
      .where('quote_date', '>=', batch[0].quote_date)
      .where('quote_date', '<=', batch[batch.length - 1].expire_date)
      .orderBy('quote_date', 'asc')

    log(
      `Found ${underlying_eod_quotes.length} underlying quotes for ${symbol} starting at ${underlying_eod_quotes[0].quote_date}`
    )

    // calculate the underlying price at expiration and the percent difference from the strike for each option quote in the batch
    const metrics = batch.map((row) => {
      const expire_quote = get_underylying_price_at_date({
        underlying_eod_quotes,
        date: row.expire_date
      })
      const expire_distance = Math.abs(expire_quote - row.strike) || null
      const expire_distance_pct = expire_distance / row.strike || null
      return {
        ...row,
        expire_quote,
        expire_distance,
        expire_distance_pct
      }
    })

    await db('eod_option_quotes')
      .insert(metrics)
      .onConflict(['underlying_symbol', 'quote_date', 'expire_date', 'strike'])
      .merge()
  }
}

const main = async () => {
  let error
  try {
    if (!argv.symbol) {
      throw new Error('Missing --symbol')
    }

    await calculate_option_metrics({ symbol: argv.symbol })
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

export default calculate_option_metrics
