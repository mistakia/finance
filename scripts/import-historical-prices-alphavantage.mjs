import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import { isMain, wait, alphavantage } from '#libs-shared'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-historical-prices-alphavantage')
debug.enable('import-historical-prices-alphavantage')

// TODO add close adjusted
const getItem = (item) => ({
  o: parseFloat(item['1. open']),
  h: parseFloat(item['2. high']),
  l: parseFloat(item['3. low']),
  c: parseFloat(item['4. close']),
  v: parseInt(item['5. volume'], 10)
})

const runOne = async ({ symbol }) => {
  const data = await alphavantage.getDailyTimeSeries({ symbol })
  const inserts = []
  for (const [date, item] of Object.entries(data['Time Series (Daily)'])) {
    // TODO add quote_unixtime
    inserts.push({
      symbol,
      quote_date: date,
      ...getItem(item)
    })
  }

  // if (argv.dry) {
  //   log(inserts[0])
  //   return
  // }

  // TODO missing quote_unixtime and close_adjusted
  // log(`Inserting ${inserts.length} prices into database`)
  // await db('eod_equity_quotes').insert(inserts).onConflict(['symbol', 'quote_date']).merge()
}

const run = async () => {
  const funds = await db('funds').select('symbol')

  for (const { symbol } of funds) {
    try {
      await runOne({ symbol })
    } catch (err) {
      log(err)
    }
    await wait(13000)
  }
}

export default run

const main = async () => {
  let error
  try {
    if (!argv.symbol) {
      console.log('missing --symbol')
      process.exit()
    }
    await runOne({ symbol: argv.symbol })
  } catch (err) {
    error = err
    console.log(error)
  }

  /* await db('jobs').insert({
   *   type: constants.jobs.PRICES_DAILY_ADJUSTED,
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
