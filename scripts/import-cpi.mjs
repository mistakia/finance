import fetch from 'node-fetch'
import debug from 'debug'
import yargs from 'yargs'
import dayjs from 'dayjs'
import { hideBin } from 'yargs/helpers'

import db from '../db/index.mjs'
import config from '../config.mjs'
import { isMain } from '../common/index.mjs'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-cpi')
debug.enable('import-cpi')

const getItem = (item) => ({
  d: dayjs(item.date).utc().format('YYYY-MM-DD'),
  v: parseFloat(item.value)
})

const run = async (symbol) => {
  const URL = `https://www.alphavantage.co/query?function=CPI&interval=monthly&apikey=${config.alphavantage}`
  const data = await fetch(URL).then((res) => res.json())

  const inserts = data.data.map((i) => getItem(i))

  if (argv.dry) {
    log(inserts[0])
    return
  }

  log(`Inserting ${inserts.length} prices into database`)
  await db('cpi').insert(inserts).onConflict().merge()
}

export default run

const main = async () => {
  let error
  try {
    await run()
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

if (isMain) {
  main()
}
