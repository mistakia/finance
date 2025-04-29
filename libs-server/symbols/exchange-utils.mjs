import debug from 'debug'
import db from '#db'
import { get_symbol_info } from './get-symbol-info.mjs'
import { search_symbol } from '../tradingview.mjs'

const log = debug('exchange-utils')

/**
 * Save symbol data to the database
 * @param {Array} symbols - Array of symbol objects to save
 * @returns {Promise<void>}
 */
export const save_symbols = async (symbols) => {
  try {
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return
    }

    const records_to_insert = symbols.map((symbol) => {
      // Clean the symbol from any HTML tags (like <em> tags)
      const clean_symbol = symbol.symbol
        ? symbol.symbol.replace(/<\/?[^>]+(>|$)/g, '')
        : ''

      return {
        symbol: clean_symbol,
        exchange: symbol.exchange || '',
        full_name: `${symbol.exchange}:${clean_symbol}`,
        description: symbol.description || '',
        type: symbol.type || '',
        updated_at: new Date()
      }
    })

    // Use knex transaction and insert with "on conflict" handling
    await db.transaction(async (trx) => {
      for (const record of records_to_insert) {
        if (!record.symbol || !record.exchange) continue

        await trx('exchange_symbols')
          .insert(record)
          .onConflict(['symbol', 'exchange'])
          .merge({
            full_name: record.full_name,
            description: record.description,
            type: record.type,
            updated_at: record.updated_at
          })
      }
    })

    log(`Saved ${records_to_insert.length} symbols`)
  } catch (error) {
    console.error('Error saving symbols:', error)
  }
}

/**
 * Get the primary exchange for a symbol
 * @param {string} symbol - Symbol to look up
 * @returns {Promise<string>} - Exchange name or "NASDAQ" as default
 */
export const get_primary_exchange = async (symbol) => {
  try {
    // First check our database
    const cached_results = await get_symbol_info({
      symbol: symbol.toUpperCase()
    })

    if (cached_results && cached_results.length > 0) {
      // Find US exchange first if possible
      const us_exchange = cached_results.find(
        (item) =>
          item.exchange === 'NYSE' ||
          item.exchange === 'NASDAQ' ||
          item.exchange === 'NYSE Arca' ||
          item.exchange === 'AMEX'
      )

      if (us_exchange) {
        return us_exchange.exchange
      }

      // Return the first matching exchange
      return cached_results[0].exchange
    }

    // If not in database, try to fetch from TradingView
    const search_results = await search_symbol({ text: symbol })
    const { symbols } = search_results

    if (symbols && symbols.length > 0) {
      // Find US exchange first if possible
      const us_result = symbols.find(
        (item) =>
          item.country === 'US' &&
          (item.exchange === 'NYSE' ||
            item.exchange === 'NASDAQ' ||
            item.exchange === 'NYSE Arca' ||
            item.exchange === 'AMEX')
      )

      if (us_result) {
        return us_result.exchange
      }

      // Return the first matching exchange
      return symbols[0].exchange
    }

    return null
  } catch (error) {
    console.error(`Error getting primary exchange for ${symbol}:`, error)
    return null
  }
}
