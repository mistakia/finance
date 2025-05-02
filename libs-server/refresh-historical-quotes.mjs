import dayjs from 'dayjs'
import debug from 'debug'

import db from '#db'
import { import_historical_prices_yahoo } from '#libs-server'

const log = debug('refresh-historical-quotes')

/**
 * Checks if historical quotes for a symbol need to be imported and imports them if needed
 *
 * @param {Object} params - Parameters for the function
 * @param {string} params.symbol - The stock symbol to check and import
 * @param {boolean} params.force_import - Whether to force import regardless of data freshness
 * @param {number} params.max_days_old - Maximum number of days old the data can be before importing (default: 2)
 * @returns {Promise<Object>} - Object containing information about the import operation
 */
export default async ({ symbol, force_import = false, max_days_old = 2 }) => {
  log(`Checking if historical quotes for ${symbol} need to be imported`)

  const last_entry = await db('end_of_day_equity_quotes')
    .where('symbol', symbol)
    .orderBy('quote_date', 'desc')
    .first()

  let import_performed = false
  let start_year

  if (last_entry) {
    const last_entry_date = dayjs(last_entry.quote_date)
    const current_date = dayjs()
    const market_close_time = current_date.hour(16).minute(0).second(0)

    // Calculate the last market day
    const last_market_day =
      current_date.day() === 0
        ? current_date.subtract(2, 'day').format('YYYY-MM-DD') // Sunday, go back to Friday
        : current_date.day() === 6
        ? current_date.subtract(1, 'day').format('YYYY-MM-DD') // Saturday, go back to Friday
        : current_date.isAfter(market_close_time)
        ? current_date.format('YYYY-MM-DD') // After market close, use today
        : current_date.day() === 1
        ? current_date.subtract(3, 'day').format('YYYY-MM-DD') // Monday before market close, go back to Friday
        : current_date.subtract(1, 'day').format('YYYY-MM-DD') // Before market close, use yesterday

    const days_since_quote = current_date.diff(last_entry_date, 'days')
    const is_up_to_date_or_newer = last_entry_date.isSameOrAfter(
      dayjs(last_market_day),
      'day'
    )

    if (
      is_up_to_date_or_newer &&
      !force_import &&
      days_since_quote <= max_days_old
    ) {
      log(`Latest quote for ${symbol} is up to date or newer. Skipping import.`)
      return {
        symbol,
        import_performed: false,
        last_quote_date: last_entry_date.format('YYYY-MM-DD'),
        days_since_quote
      }
    }

    if (force_import) {
      log(`Forcing import for ${symbol}`)
    } else if (days_since_quote > max_days_old) {
      log(
        `Latest quote for ${symbol} is ${days_since_quote} days old, which exceeds the maximum of ${max_days_old} days`
      )
    } else {
      log(
        `Last entry ${last_entry_date.format(
          'YYYY-MM-DD'
        )} does not match or is before last market day ${last_market_day}`
      )
    }

    start_year = last_entry_date.year()
    log(`Last entry for ${symbol} found, starting from year: ${start_year}`)
  } else {
    start_year = dayjs().subtract(1, 'year').startOf('year').year()
    log(`No last entry for ${symbol} found, starting from year: ${start_year}`)
  }

  log(`Importing historical prices for ${symbol} starting from ${start_year}`)
  await import_historical_prices_yahoo({ symbol, start_year })
  import_performed = true

  // Get the updated last entry after import
  const updated_last_entry = await db('end_of_day_equity_quotes')
    .where('symbol', symbol)
    .orderBy('quote_date', 'desc')
    .first()

  return {
    symbol,
    import_performed,
    last_quote_date: updated_last_entry
      ? dayjs(updated_last_entry.quote_date).format('YYYY-MM-DD')
      : null,
    days_since_quote: updated_last_entry
      ? dayjs().diff(dayjs(updated_last_entry.quote_date), 'days')
      : null
  }
}
