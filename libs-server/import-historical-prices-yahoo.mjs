import debug from 'debug'
import yahoo_finance from 'yahoo-finance2'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'

import db from '#db'
import { wait } from '#libs-shared'

const log = debug('import-historical-prices-yahoo')
dayjs.extend(utc)

/**
 * Converts a Yahoo Finance history item to our database format
 *
 * @param {Object} item - Yahoo Finance history item
 * @returns {Object} - Formatted item for database insertion
 */
const get_item = (item) => ({
  quote_date: dayjs.utc(item.date).format('YYYY-MM-DD'),
  o: parseFloat(item.open),
  h: parseFloat(item.high),
  l: parseFloat(item.low),
  c: parseFloat(item.close),
  c_adj: parseFloat(item.adjClose),
  v: Number(item.volume),
  quote_unixtime: dayjs.utc(item.date).unix()
})

/**
 * Requests historical price data from Yahoo Finance for a specific time period
 *
 * @param {Object} params - Parameters for the request
 * @param {string} params.symbol - The stock symbol to request data for
 * @param {number} params.start_year - The start year for the request
 * @param {number} params.end_year - The end year for the request
 * @returns {Promise<Array>} - Array of inserted price records
 */
const request_data = async ({ symbol, start_year, end_year }) => {
  log(
    `Requesting historical prices for ${symbol} from ${start_year} to ${end_year}`
  )
  const start_month = 1
  const start_day = 1
  const end_month = 12
  const end_day = 31
  const prices = await yahoo_finance.historical(symbol, {
    period1: `${start_year}-${start_month}-${start_day}`,
    period2: `${end_year}-${end_month}-${end_day}`
  })

  const inserts = prices.map((i) => ({
    symbol,
    ...get_item(i)
  }))

  log(`Inserting ${inserts.length} prices into database`)
  await db('eod_equity_quotes')
    .insert(inserts)
    .onConflict(['symbol', 'quote_date'])
    .merge()

  return inserts
}

/**
 * Imports historical price data from Yahoo Finance
 *
 * @param {Object} params - Parameters for the import
 * @param {string} params.symbol - The stock symbol to import data for
 * @param {number} params.start_year - Optional start year for the import (default: 1900)
 * @param {number} params.wait_time_ms - Optional wait time between requests in milliseconds (default: 10000)
 * @returns {Promise<Array>} - Array of all imported price records
 */
const import_historical_prices_yahoo = async ({
  symbol,
  start_year,
  wait_time_ms = 10000
}) => {
  const current_year = new Date().getFullYear()
  let all_data = []

  log(`Importing historical prices for ${symbol} starting from ${current_year}`)

  // Start from current year and work backward
  let end_year = current_year
  let continue_search = true
  const min_year = start_year || 1900 // Use start_year if provided, otherwise set a reasonable minimum

  while (end_year >= min_year && continue_search) {
    const start_year_chunk = Math.max(end_year - 4, min_year) // Get 5-year chunks (inclusive)

    log(`Requesting data for ${symbol} from ${start_year_chunk} to ${end_year}`)
    const res = await request_data({
      symbol,
      start_year: start_year_chunk,
      end_year
    })

    if (res && res.length > 0) {
      log(`Found ${res.length} records for ${start_year_chunk}-${end_year}`)
      all_data = [...res, ...all_data] // Prepend new data to maintain chronological order

      // If we've reached the start_year, we can stop
      if (start_year && start_year_chunk === start_year) {
        log(`Reached requested start year ${start_year}`)
        continue_search = false
      }

      // Check if we got data for the full period
      // If not, we've likely reached the earliest available data
      if (!start_year) {
        const years_in_data = new Set(
          res.map((item) => dayjs.utc(item.quote_date).year())
        )
        const expected_years = end_year - start_year_chunk + 1

        if (years_in_data.size < expected_years) {
          log(
            `Incomplete data for period ${start_year_chunk}-${end_year}, likely reached earliest available data`
          )
          continue_search = false
        }
      }
    } else {
      // No data found for this period, we can stop
      log(
        `No data found for ${start_year_chunk}-${end_year}, reached earliest available data`
      )
      continue_search = false
    }

    // Move to the previous chunk
    end_year = start_year_chunk - 1

    // Only wait if we're continuing the search
    if (continue_search && end_year >= min_year) {
      await wait(wait_time_ms)
    }
  }

  if (all_data.length === 0) {
    log(`No historical data found for ${symbol}`)
  } else {
    log(
      `Completed historical data import, collected ${all_data.length} records`
    )
  }

  return all_data
}

export default import_historical_prices_yahoo
export { request_data, get_item }
