import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '../db/index.js'
import { isMain } from '../common/index.js'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('calculate-days')
debug.enable('calculate-days')

const run = async ({ rate = 1.0 }) => {
  const data = await db('adjusted_daily_prices')
    // .where('d', '>', '1969-01-01')
    .orderBy('d', 'asc')

  const results = []
  for (let i = 0; i < data.length; i++) {
    let days = 0
    let date
    let price

    for (let j = i; j < data.length; j++) {
      // higher than entry, previous was not
      if (data[j].c > data[i].c * rate && !date) {
        date = data[j].d
        days = j - i
        price = data[j].c
      }

      // lower than entry
      if (data[j].c < data[i].c * rate) {
        date = null
        days = 0
      }
    }

    results.push({
      date: data[i].d,
      entry: data[i].c,
      days,
      price,
      target_date: date
    })
  }

  const sorted = results.sort((a, b) => b.days - a.days)
  log(sorted.splice(0, 10))
}

export default run

const main = async () => {
  let error
  try {
    await run({ rate: argv.rate })
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

if (isMain) {
  main()
}
