import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import yahooStockPrices from 'yahoo-stock-prices'
import dayjs from 'dayjs'

import db from '#db'
import { isMain, wait } from '#common'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-historical-prices-yahoo')
debug.enable('import-historical-prices-yahoo')

const getItem = (item) => ({
  d: dayjs(item.date * 1000).format('YYYY-MM-DD'),
  o: parseFloat(item.open),
  h: parseFloat(item.high),
  l: parseFloat(item.low),
  c: parseFloat(item.close),
  v: parseInt(item.volume, 10)
})

const requestData = async ({ symbol, startYear, endYear }) => {
  log({ startYear, endYear })
  const startMonth = 1
  const startDay = 1
  const endMonth = 12
  const endDay = 31
  const prices = await yahooStockPrices.getHistoricalPrices(
    startMonth,
    startDay,
    startYear,
    endMonth,
    endDay,
    endYear,
    symbol,
    '1d'
  )

  const inserts = prices.map((i) => ({
    symbol,
    ...getItem(i)
  }))

  console.log(inserts[inserts.length - 1])

  log(`Inserting ${inserts.length} prices into database`)
  await db('adjusted_daily_prices').insert(inserts).onConflict().merge()

  return inserts
}

const run = async ({ symbol, startYear = 1927 }) => {
  const endYear = 2022
  let res
  do {
    res = await requestData({ symbol, startYear, endYear: startYear + 5 })

    if (res) {
      startYear += 5
    }

    await wait(10000)
  } while (res && res.length && startYear < endYear)
}

export default run

const main = async () => {
  let error
  try {
    if (!argv.symbol) {
      console.log('missing --symbol path')
      process.exit()
    }
    await run({ symbol: argv.symbol, startYear: argv.start })
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
