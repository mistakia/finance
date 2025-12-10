import debug from 'debug'

import db from '#db'
import {
  get_primary_exchange,
  get_symbol_info,
  save_symbols
} from './symbols/index.mjs'
import { get as get_cache, set as set_cache } from './cache.mjs'

const log = debug('tradingview')

const get_config = async () => {
  const config_row = await db('config')
    .where({ key: 'tradingview_config' })
    .first()
  return config_row.value
}

/**
 * Searches for symbols on TradingView
 * @param {Object} params - Parameters for the search
 * @param {string} params.text - The text to search for
 * @param {string} [params.lang="en"] - Language
 * @param {string} [params.country="US"] - Country to prioritize in results
 * @returns {Promise<Array>} - Array of symbol information objects
 */
export const search_symbol = async ({ text, lang = 'en', country = 'US' }) => {
  try {
    log({ text, lang, country })
    const config = await get_config()

    // Check if we have the symbol in database
    const existing_symbols = await get_symbol_info({ symbol: text })
    if (existing_symbols && existing_symbols.length > 0) {
      log('Using existing symbol data')
      return existing_symbols
    }

    // Construct search URL
    const search_url = `${config.symbol_search_url}/?text=${encodeURIComponent(
      text
    )}&hl=1&exchange=&lang=${lang}&search_type=undefined&domain=production&sort_by_country=${country}&promo=true`

    log(`Searching for ${text} on ${search_url}`)

    const response = await fetch(search_url, {
      headers: {
        accept: '*/*',
        'accept-language': 'en-US,en;q=0.9',
        origin: 'https://www.tradingview.com',
        priority: 'u=1, i',
        referer: 'https://www.tradingview.com/',
        'sec-ch-ua':
          '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site',
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'
      },
      method: 'GET'
    })

    if (!response.ok) {
      throw new Error(
        `TradingView API error: ${response.status} ${response.statusText}`
      )
    }

    const data = await response.json()

    if (data && data.symbols && Array.isArray(data.symbols)) {
      // Save the symbols in our database
      await save_symbols(data.symbols)
      return data
    }

    return []
  } catch (error) {
    console.error('Error searching symbols on TradingView:', error)
    throw error
  }
}

/**
 * Format exchange name to the format expected by TradingView options API
 * @param {string} exchange - Exchange name from symbol search
 * @returns {string} - Formatted exchange name
 */
const format_exchange_for_options = (exchange) => {
  const exchange_map = {
    NYSE: 'NYSE',
    NASDAQ: 'NASDAQ',
    'NYSE Arca': 'AMEX',
    AMEX: 'AMEX',
    'NYSE American': 'AMEX',
    MIL: 'MIL',
    LSE: 'LSE',
    BMV: 'BMV',
    BIVA: 'BIVA'
  }

  return exchange_map[exchange] || exchange
}

/**
 * Fetches option data from TradingView API
 * @param {Object} params - Parameters for the request
 * @param {string} params.symbol - The symbol to get option data for (e.g., "CEG", "AAPL")
 * @param {string|number} params.expiration_date - Expiration date in YYYYMMDD format (e.g., 20250516)
 * @param {string} [params.exchange="NASDAQ"] - Exchange for the symbol
 * @returns {Promise<Object>} - The option data response
 */
export const get_option_data = async ({
  symbol,
  expiration_date,
  exchange = 'NASDAQ'
}) => {
  log({ symbol, expiration_date, exchange })
  try {
    // Try to get from cache first
    const cache_key = `tradingview/options/${symbol}/${expiration_date}/${exchange}`
    const cached_data = await get_cache({ key: cache_key })
    if (cached_data) {
      log(`Using cached option data for ${symbol} ${expiration_date}`)
      return cached_data
    }

    const config = await get_config()

    // Format the exchange name correctly
    const formatted_exchange = format_exchange_for_options(exchange)

    const response = await fetch(
      `${config.options_url}?label-product=options-overlay`,
      {
        headers: {
          accept: 'application/json',
          'accept-language': 'en-US,en;q=0.9',
          'content-type': 'text/plain;charset=UTF-8',
          'sec-ch-ua':
            '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"macOS"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-site',
          Referer: 'https://www.tradingview.com/',
          'Referrer-Policy': 'origin-when-cross-origin'
        },
        body: JSON.stringify({
          columns: [
            'ask',
            'bid',
            'currency',
            'delta',
            'expiration',
            'gamma',
            'iv',
            'option-type',
            'pricescale',
            'rho',
            'root',
            'strike',
            'theoPrice',
            'theta',
            'vega'
          ],
          filter: [
            { left: 'type', operation: 'equal', right: 'option' },
            {
              left: 'expiration',
              operation: 'equal',
              right: parseInt(expiration_date)
            },
            { left: 'root', operation: 'equal', right: symbol }
          ],
          ignore_unknown_fields: false,
          index_filters: [
            {
              name: 'underlying_symbol',
              values: [`${formatted_exchange}:${symbol}`]
            }
          ]
        }),
        method: 'POST'
      }
    )

    if (!response.ok) {
      throw new Error(
        `TradingView API error: ${response.status} ${response.statusText}`
      )
    }

    const data = await response.json()

    // Cache the response
    await set_cache({ key: cache_key, value: data })

    return data
  } catch (error) {
    console.error('Error fetching option data from TradingView:', error)
    throw error
  }
}

/**
 * Parse a TradingView option symbol to extract its components
 * @param {string} symbol - TradingView option symbol (e.g., "OPRA:LQDA250516C25.0")
 * @returns {Object} - Parsed components including underlying, expiration, type, and strike
 */
export const parse_tradingview_option_symbol = (symbol) => {
  log({ symbol })
  try {
    // Format typically: OPRA:LQDA250516C25.0
    const parts = symbol.split(':')
    const option_part = parts[1]

    // Extract components
    const match = option_part.match(/^([A-Z]+)(\d{6})([CP])(\d+(?:\.\d+)?)$/)

    if (!match) {
      throw new Error(`Failed to parse TradingView option symbol: ${symbol}`)
    }

    const [, underlying, expiration_str, option_type, strike_str] = match

    // Format expiration date as YYYYMMDD
    const year = '20' + expiration_str.substring(0, 2)
    const month = expiration_str.substring(2, 4)
    const day = expiration_str.substring(4, 6)
    const expiration_date = parseInt(`${year}${month}${day}`)

    return {
      underlying,
      expiration_date,
      option_type: option_type === 'C' ? 'call' : 'put',
      strike: parseFloat(strike_str)
    }
  } catch (error) {
    console.error(`Error parsing TradingView option symbol ${symbol}:`, error)
    throw error
  }
}

/**
 * Find matching option data from TradingView API based on specific criteria
 * @param {Object} params - Parameters for the search
 * @param {string} params.symbol - Underlying symbol (e.g., "LQDA")
 * @param {string|number} params.expiration_date - Option expiration date in YYYYMMDD format
 * @param {string} params.option_type - Option type ("call" or "put")
 * @param {number} params.strike - Strike price
 * @param {string} [params.exchange="NASDAQ"] - Exchange for the symbol
 * @returns {Promise<Object|null>} - Matched option data or null if not found
 */
export const get_specific_option_data = async ({
  symbol,
  expiration_date,
  option_type,
  strike,
  exchange = 'NASDAQ'
}) => {
  try {
    log({ symbol, expiration_date, option_type, strike, exchange })
    const data = await get_option_data({
      symbol,
      expiration_date,
      exchange
    })

    if (!data || !data.symbols || !Array.isArray(data.symbols)) {
      console.warn(
        `No options data returned for ${symbol} exp:${expiration_date}`
      )
      return null
    }

    // Create a map of field names to indices
    const field_indices = {}
    data.fields.forEach((field_name, index) => {
      field_indices[field_name] = index
    })

    // Find the matching option based on option_type and strike
    const option = data.symbols.find((item) => {
      const fields = item.f
      const item_option_type = fields[field_indices['option-type']]
      const item_strike = fields[field_indices.strike]

      return (
        item_option_type === option_type &&
        Math.abs(item_strike - strike) < 0.001 // Account for potential floating point issues
      )
    })

    if (!option) {
      console.warn(
        `No matching option found for ${symbol} ${expiration_date} ${option_type} ${strike}`
      )
      return null
    }

    // Convert array format to object with named fields
    const formatted_data = {}
    data.fields.forEach((field_name, index) => {
      formatted_data[field_name] = option.f[index]
    })

    return formatted_data
  } catch (error) {
    console.error('Error getting specific option data:', error)
    return null
  }
}

/**
 * Get delta value for an option from TradingView (fallback for when IB data is unavailable)
 * @param {Object} params - Parameters for the option
 * @param {string} params.symbol - Underlying symbol
 * @param {string|number} params.expiration_date - Option expiration date in YYYYMMDD format
 * @param {string} params.option_type - Option type ("call" or "put")
 * @param {number} params.strike - Strike price
 * @param {string} [params.exchange] - Exchange for the symbol (if null, will be looked up)
 * @returns {Promise<number|null>} - Delta value or null if unavailable
 */
export const get_option_delta = async ({
  symbol,
  expiration_date,
  option_type,
  strike,
  exchange = null
}) => {
  try {
    log({ symbol, expiration_date, option_type, strike, exchange })

    // If exchange not provided, look it up
    if (!exchange) {
      exchange = await get_primary_exchange(symbol)
    }

    const option_data = await get_specific_option_data({
      symbol,
      expiration_date,
      option_type,
      strike,
      exchange
    })

    return option_data ? option_data.delta : null
  } catch (error) {
    console.error('Error getting option delta from TradingView:', error)
    return null
  }
}

/**
 * Get full market data for an option from TradingView (fallback for when IB data is unavailable)
 * Returns price (theoPrice or mid), bid, ask, and all greeks
 * @param {Object} params - Parameters for the option
 * @param {string} params.symbol - Underlying symbol
 * @param {string|number} params.expiration_date - Option expiration date in YYYYMMDD format
 * @param {string} params.option_type - Option type ("call" or "put")
 * @param {number} params.strike - Strike price
 * @param {string} [params.exchange] - Exchange for the symbol (if null, will be looked up)
 * @returns {Promise<Object|null>} - Market data object or null if unavailable
 */
export const get_option_market_data = async ({
  symbol,
  expiration_date,
  option_type,
  strike,
  exchange = null
}) => {
  try {
    log({ symbol, expiration_date, option_type, strike, exchange })

    // If exchange not provided, look it up
    if (!exchange) {
      exchange = await get_primary_exchange(symbol)
    }

    const option_data = await get_specific_option_data({
      symbol,
      expiration_date,
      option_type,
      strike,
      exchange
    })

    if (!option_data) {
      return null
    }

    // Calculate mid price if bid and ask are available
    const bid = option_data.bid
    const ask = option_data.ask
    const mid_price = bid && ask ? (bid + ask) / 2 : null

    // Use theoPrice (theoretical/model price) as primary, fall back to mid price
    const price = option_data.theoPrice || mid_price

    return {
      price,
      bid,
      ask,
      delta: option_data.delta,
      gamma: option_data.gamma,
      theta: option_data.theta,
      vega: option_data.vega,
      rho: option_data.rho,
      impliedVol: option_data.iv,
      source: 'tradingview'
    }
  } catch (error) {
    console.error('Error getting option market data from TradingView:', error)
    return null
  }
}
