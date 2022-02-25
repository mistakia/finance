import debug from 'debug'
import yargs from 'yargs'
import dayjs from 'dayjs'
import { hideBin } from 'yargs/helpers'
import { printTable } from 'console-table-printer'

import db from '../db/index.js'
import { isMain } from '../common/index.js'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('calculate-days')
debug.enable('calculate-days')

const run = async ({ rate = 1.0, start = null, adjusted = true }) => {
  log({ rate, start, adjusted })
  const cpi = await db('cpi')
  const cpi_map = {}
  cpi.forEach((i) => {
    cpi_map[dayjs(i.d).format('YYYY-MM-DD')] = i.v
  })

  const query = db('adjusted_daily_prices').orderBy('d', 'asc')
  if (start) {
    query.where('d', '>', start)
  }

  let data = await query

  data = data.map(({ d, ...i }) => ({
    d: dayjs(d),
    cpi_d: dayjs(d).date(1).format('YYYY-MM-DD'),
    ...i
  }))

  const results = []
  for (let i = 0; i < data.length; i++) {
    process.stdout.write(`${i} / ${data.length}\r`)

    const entry_cpi = cpi_map[data[i].cpi_d]
    let days = Infinity
    let date
    let price

    for (let j = i; j < data.length; j++) {
      let target_value = data[i].c * rate
      if (adjusted) {
        const cpi_value = cpi_map[data[j].cpi_d]
        if (!cpi_value) continue
        const cpi_rate = (cpi_value - entry_cpi) / entry_cpi
        target_value = target_value * (1 + cpi_rate)
      }

      // higher than entry and previous period was not
      if (data[j].c > target_value && !date) {
        date = data[j].d
        days = j - i
        price = target_value
      }

      // lower than entry
      if (data[j].c < target_value) {
        date = null
        days = Infinity
      }
    }

    if (!date) {
      continue
    }

    results.push({
      days,
      entry_date: data[i].d.format('YYYY-MM-DD'),
      entry_price: data[i].c,
      entry_cpi,
      price: price && price.toFixed(2),
      date: date && date.format('YYYY-MM-DD'),
      cpi: date && cpi_map[date.date(1).format('YYYY-MM-DD')]
    })
  }

  const sorted = results.sort((a, b) => b.days - a.days)
  const filter = []
  const limit = 30

  for (let i = 0; i < sorted.length && filter.length < limit; i++) {
    const date = dayjs(sorted[i].entry_date)
    let valid = true
    process.stdout.write(`${i} / ${sorted.length}\r`)

    for (let j = 0; j < filter.length; j++) {
      if (Math.abs(dayjs(filter[j].entry_date).diff(date, 'day')) < 60) {
        valid = false
        break
      }
    }
    if (valid) filter.push(sorted[i])
  }
  printTable(filter.splice(0, limit))
}

export default run

const main = async () => {
  let error
  try {
    await run({ rate: argv.rate, adjusted: argv.adjusted, start: argv.start })
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
