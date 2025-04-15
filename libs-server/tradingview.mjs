import debug from 'debug'

const log = debug('tradingview')

const get_config = async () => {
  const config_row = await db('config').where({ key: 'tradingview_config' }).first()
  return config_row.value
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
    const config = await get_config()
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
            { name: 'underlying_symbol', values: [`${exchange}:${symbol}`] }
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
 * @param {string} [params.exchange="NASDAQ"] - Exchange for the symbol
 * @returns {Promise<number|null>} - Delta value or null if unavailable
 */
export const get_option_delta = async ({
  symbol,
  expiration_date,
  option_type,
  strike,
  exchange = 'NASDAQ'
}) => {
  try {
    log({ symbol, expiration_date, option_type, strike, exchange })
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
 * Example usage:
 *
 * const options_data = await get_option_data({
 *   symbol: "CEG",
 *   expiration_date: 20250516
 * })
 */
