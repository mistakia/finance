import { format_merchant_name } from './format-merchant-name.mjs'

/**
 * Generate a standardized link for merchants or institutions
 * @param {string} transaction_description - The transaction description to standardize
 * @param {string} type - Transaction type (purchase, income, transfer)
 * @param {string} format - Original data format (chase, ally, etc.)
 * @param {Object} config - Configuration object with link formatting rules
 * @returns {string} Standardized link in format /merchant/amazon, /custodian/ally_bank, etc.
 */
const format_link = async ({
  transaction_description,
  type = 'purchase',
  format = null,
  config
}) => {
  if (!transaction_description) return '/merchant/unknown'

  // Clean the merchant name
  const clean_name = format_merchant_name({
    transaction_description,
    format,
    config
  })

  // Check pattern groups in order of priority
  const pattern_groups = [
    { patterns: config.links.institutions, prefix: 'institution' },
    { patterns: config.links.merchants, prefix: 'merchant' },
    { patterns: config.links.government, prefix: 'government' }
  ]

  // Find the first matching pattern across all groups
  for (const group of pattern_groups) {
    const match = find_pattern_match(clean_name, group.patterns)
    if (match) return match
  }

  // Default pattern for other merchants
  return config.links.default_format(clean_name)
}

/**
 * Find a matching pattern in a list of pattern objects
 * @param {string} clean_name - The cleaned merchant name
 * @param {Array} pattern_list - List of pattern objects to match against
 * @returns {string|null} The matching link or null if no match
 */
const find_pattern_match = (clean_name, pattern_list) => {
  if (!pattern_list || !Array.isArray(pattern_list)) return null

  for (const item of pattern_list) {
    for (const pattern of item.patterns) {
      if (clean_name.match(pattern)) {
        return item.link
      }
    }
  }

  return null
}

/**
 * Factory function that creates a link formatter with the provided config
 * @param {Object} config - Configuration object with link formatting rules
 * @returns {Function} Configured link formatter function
 */
export const create_link_formatter = (config) => {
  return async ({ transaction_description, type, format }) =>
    format_link({
      transaction_description,
      type,
      format,
      config
    })
}
