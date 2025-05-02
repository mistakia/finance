import debug from 'debug'
import yargs from 'yargs'
import dayjs from 'dayjs'
import percentile from 'percentile'
import { hideBin } from 'yargs/helpers'
import { Table } from 'console-table-printer'

import db from '#db'
import { isMain, average, median } from '#libs-shared'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('calculate-returns')
debug.enable('calculate-returns')

const run = async ({ start, adjusted = true, symbol = 'SPY' }) => {
  log({ start, adjusted })
  const return_years = [1, 3, 5, 10, 20, 30]
  const dca_intervals = [3, 6, 12, 24]

  const cpi = await db('cpi')
  const cpi_map = {}
  cpi.forEach((i) => {
    cpi_map[dayjs(i.quote_date).format('YYYY-MM-DD')] = i.volume
  })

  const query = db('end_of_day_equity_quotes')
    .where({ symbol })
    .orderBy('quote_date', 'asc')
  if (start) {
    query.where('quote_date', '>', start)
  }

  let data = await query
  const data_map = {}
  data = data.map(({ quote_date, ...i }) => {
    const date = dayjs(quote_date)
    data_map[date.format('YYYY-MM-DD')] = i.adjusted_close_price

    return {
      quote_date: date,
      cpi_quote_date: dayjs(quote_date).date(1).format('YYYY-MM-DD'),
      ...i
    }
  })
  const max_date = data[data.length - 1].quote_date

  const getFutureClose = ({ date, years, months }) => {
    let pointer = date
    if (years) {
      pointer = pointer.add(years, 'year')
    }
    if (months) {
      pointer = pointer.add(months, 'month')
    }
    while (pointer.isBefore(max_date)) {
      const d = pointer.format('YYYY-MM-DD')
      if (data_map[d]) {
        return data_map[d]
      }
      pointer = pointer.add(1, 'day')
    }

    return null
  }

  const getBasis = (date, periods) => {
    const closes = []
    for (let i = 0; i < periods; i++) {
      const close = getFutureClose({ date, months: i })
      if (close) closes.push(close)
    }
    if (!closes.length) return null

    return average(closes)
  }

  const results = []
  for (let i = 0; i < data.length; i++) {
    process.stdout.write(`${i} / ${data.length}\r`)

    // const entry_cpi = cpi_map[data[i].cpi_quote_date]
    const future_closes = {}
    return_years.forEach((years) => {
      future_closes[`return${years}_close`] = getFutureClose({
        date: data[i].quote_date,
        years
      })
    })

    const future_returns_lump = {}
    return_years.forEach((years) => {
      const future_close = future_closes[`return${years}_close`]
      if (!future_close) return
      const value =
        (future_close - data[i].adjusted_close_price) /
        data[i].adjusted_close_price
      if (isNaN(value)) return
      future_returns_lump[`return${years}_lump`] = value
    })

    const dca_basis = {}
    dca_intervals.forEach((intervals) => {
      dca_basis[intervals] = getBasis(data[i].quote_date, intervals)
    })

    const future_dca_returns = {}
    dca_intervals.forEach((intervals) => {
      return_years.forEach((years) => {
        const future_close = future_closes[`return${years}_close`]
        if (!future_close) return
        const basis = dca_basis[intervals] || data[i].adjusted_close_price
        const value = (future_close - basis) / basis
        if (isNaN(value)) return
        future_dca_returns[`return${years}_dca_${intervals}`] = value
      })
    })

    results.push({
      entry_date: data[i].quote_date.format('YYYY-MM-DD'),
      entry_price: data[i].adjusted_close_price,
      ...future_returns_lump,
      ...future_dca_returns
    })
  }

  // get list of result item properties
  const exclude = ['entry_date', 'entry_price']
  const properties = Object.keys(results[0]).filter(
    (key) => !exclude.includes(key)
  )

  return_years.forEach((year) => {
    const search = `return${year}_`
    const filtered_properties = properties.filter((p) => p.includes(search))
    const items = []
    filtered_properties.forEach((property) => {
      const values = results.map((p) => p[property]).filter((p) => Boolean(p))
      const item = {
        label: property.split(search).pop(),
        average: average(values),
        median: median(values),
        min: Math.min(...values),
        max: Math.max(...values),
        p10: percentile(10, values),
        p25: percentile(25, values),
        p75: percentile(75, values)
      }
      items.push(item)
    })
    if (!items.length) return
    const p = new Table({ title: `${year}Year Return` })
    p.addRows(items)
    p.printTable()
  })

  // const limit = 25
  // const sorted = results.sort((a, b) => b.return10_lump - a.return10_lump)
  // printTable(sorted.splice(0, limit))
}

export default run

const main = async () => {
  let error
  try {
    await run({ adjusted: argv.adjusted, start: argv.start })
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
