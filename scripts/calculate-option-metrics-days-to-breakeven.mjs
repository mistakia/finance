import debug from 'debug'
import dayjs from 'dayjs'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter.js'

import db from '#db'
// import config from '#config'
import { isMain } from '#libs-shared'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('calculate-days-to-breakeven')
debug.enable('calculate-days-to-breakeven')

dayjs.extend(isSameOrAfter)

const get_underlying_quotes = async ({ symbol, start_date, end_date }) =>
  db('end_of_day_equity_quotes')
    .where({ symbol })
    .where('quote_date', '>=', start_date)
    .where('quote_date', '<=', end_date)
    .orderBy('quote_date', 'asc')

const get_days_to_breakeven = async ({
  option_quote,
  underlying_eod_quotes
}) => {
  const cost_basis = option_quote.strike - option_quote.p_last

  const start_index = underlying_eod_quotes.findIndex((q) =>
    dayjs(q.quote_date).isSameOrAfter(option_quote.expire_date)
  )

  for (let d = start_index; d < underlying_eod_quotes.length; d++) {
    if (underlying_eod_quotes[d].close_price >= cost_basis) {
      return d - start_index
    }
  }

  // load more underlying_quotes and recursively call this function again
  const start_date =
    underlying_eod_quotes[underlying_eod_quotes.length - 1].quote_date
  const end_date = dayjs(start_date).add(2, 'year').format('YYYY-MM-DD')
  const symbol = option_quote.symbol
  const more_underlying_eod_quotes = await get_underlying_quotes({
    symbol,
    start_date,
    end_date
  })

  return get_days_to_breakeven({
    option_quote,
    underlying_eod_quotes: [
      ...underlying_eod_quotes,
      ...more_underlying_eod_quotes
    ]
  })
}

const calculate_days_to_breakeven = async ({ symbol }) => {
  log(`Calculating days to breakeven for options on ${symbol}...`)

  // iterate over all put options that were exercised
  const batchSize = 100000
  let offset = 0

  while (true) {
    const batch = await db('eod_option_quotes')
      .where({ underlying_symbol: symbol })
      .where(db.raw('strike > expire_quote'))
      .where(db.raw('strike < underlying_last'))
      .orderBy('expire_unix', 'asc')
      .limit(batchSize)
      .offset(offset)

    offset += batchSize

    // stop if there are no more rows to process
    if (batch.length === 0) {
      break
    }

    log(
      `Processing ${batch.length} rows for options on ${symbol} starting at ${batch[0].quote_date}`
    )

    const start_date = batch[0].expire_date
    const end_date = dayjs(batch[batch.length - 1].expire_date)
      .add(1, 'year')
      .format('YYYY-MM-DD')
    const underlying_eod_quotes = await get_underlying_quotes({
      symbol,
      start_date,
      end_date
    })

    log(
      `Found ${underlying_eod_quotes.length} underlying quotes for ${symbol} starting at ${underlying_eod_quotes[0].quote_date}`
    )

    const inserts = []

    for (let i = 0; i < batch.length; i += 1) {
      const option_quote = batch[i]
      const days_to_breakeven = await get_days_to_breakeven({
        option_quote,
        underlying_eod_quotes
      })

      if (days_to_breakeven !== null) {
        inserts.push({
          underlying_symbol: option_quote.underlying_symbol,
          quote_date: option_quote.quote_date,
          expire_date: option_quote.expire_date,
          strike: option_quote.strike,
          days_to_breakeven
        })
      }
    }

    if (inserts.length > 0) {
      await db('eod_option_quotes')
        .insert(inserts)
        .onConflict([
          'underlying_symbol',
          'quote_date',
          'expire_date',
          'strike'
        ])
        .merge()
      log(`Updated ${inserts.length} rows for ${symbol}...`)
    }
  }
}

const main = async () => {
  let error
  try {
    if (!argv.symbol) {
      throw new Error('Missing --symbol')
    }

    await calculate_days_to_breakeven({ symbol: argv.symbol })
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

export default calculate_days_to_breakeven
