import debug from 'debug'
import db from '#db'

const log = debug('get-symbol-info')

/**
 * Retrieve symbol information from the exchange_symbols table
 * @param {Object} params - Search parameters
 * @param {string} [params.symbol] - Symbol to search for (case-insensitive, partial match)
 * @param {string} [params.exchange] - Exchange to filter by (exact match)
 * @returns {Promise<Array>} - Array of matching symbol records
 */
export const get_symbol_info = async ({ symbol = null, exchange = null }) => {
  try {
    let query = db('exchange_symbols')

    if (symbol) {
      // Allow partial symbol matches
      query = query.whereILike('symbol', `%${symbol}%`)
    }

    if (exchange) {
      query = query.where({ exchange })
    }

    const results = await query.select('*')
    log(`Found ${results.length} matching symbols for:`, { symbol, exchange })
    return results
  } catch (error) {
    console.error('Error retrieving symbol info:', error)
    return []
  }
}
