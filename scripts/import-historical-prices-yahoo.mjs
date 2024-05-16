import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import yahoo_finance from 'yahoo-finance2'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'

import db from '#db'
import { isMain, wait } from '#libs-shared'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-historical-prices-yahoo')
debug.enable('import-historical-prices-yahoo')

dayjs.extend(utc)

const getItem = (item) => ({
  quote_date: dayjs.utc(item.date).format('YYYY-MM-DD'),
  o: parseFloat(item.open),
  h: parseFloat(item.high),
  l: parseFloat(item.low),
  c: parseFloat(item.close),
  c_adj: parseFloat(item.adjClose),
  v: Number(item.volume),
  quote_unixtime: dayjs.utc(item.date).unix()
})

const requestData = async ({ symbol, startYear, endYear }) => {
  log(
    `Requesting historical prices for ${symbol} from ${startYear} to ${endYear}`
  )
  const startMonth = 1
  const startDay = 1
  const endMonth = 12
  const endDay = 31
  const prices = await yahoo_finance.historical(symbol, {
    period1: `${startYear}-${startMonth}-${startDay}`,
    period2: `${endYear}-${endMonth}-${endDay}`
  })

  const inserts = prices.map((i) => ({
    symbol,
    ...getItem(i)
  }))

  log(`Inserting ${inserts.length} prices into database`)
  await db('eod_equity_quotes').insert(inserts).onConflict().merge()

  return inserts
}

const import_historical_prices_yahoo = async ({ symbol, startYear = 1927 }) => {
  let endYear
  const current_year = new Date().getFullYear()
  let res
  do {
    endYear = Math.min(current_year, startYear + 5)
    res = await requestData({ symbol, startYear, endYear })

    if (res && endYear !== current_year) {
      startYear += 5
    }

    await wait(10000)
  } while (res && res.length && endYear !== current_year)
}

export default import_historical_prices_yahoo

const main = async () => {
  let error
  try {
    if (!argv.symbol) {
      console.log('missing --symbol path')
      process.exit()
    }
    await import_historical_prices_yahoo({
      symbol: argv.symbol,
      startYear: argv.start
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
