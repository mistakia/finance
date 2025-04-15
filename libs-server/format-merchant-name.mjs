/**
 * Standardizes merchant names by removing common prefixes/suffixes and cleaning up formatting
 * @param {string} transaction_description - Original merchant name
 * @param {string} format - Data format (chase, ally, etc.)
 * @param {Object} config - Configuration object with merchant formatting rules
 * @returns {string} Standardized merchant name
 */
export const format_merchant_name = ({
  transaction_description,
  format,
  config
}) => {
  if (!transaction_description || typeof transaction_description !== 'string') {
    return 'Unknown'
  }

  let cleaned = transaction_description

  // Apply special case handling first (for exact matches)
  const special_case = config.merchants.special_cases?.find((sc) =>
    sc.test(cleaned, format)
  )

  if (special_case) {
    return special_case.result
  }

  // Handle format-specific rules
  if (format && config.merchants[format]) {
    // Special case for Capital One "IN *" prefix
    if (format === 'capital_one' && cleaned.startsWith('IN *')) {
      cleaned = cleaned.substring(4)
    }

    // Apply all pattern replacements for this format
    const format_rules = config.merchants[format]
    for (const rule of format_rules) {
      cleaned = cleaned.replace(rule.pattern, rule.replacement)
    }
  }

  // Apply default whitespace cleanup
  if (config.merchants.default_formatters?.clean_whitespace) {
    cleaned = config.merchants.default_formatters.clean_whitespace(cleaned)
  }

  return cleaned
}

/**
 * Factory function that creates a merchant name formatter with the provided config
 * @param {Object} config - Configuration object with merchant formatting rules
 * @returns {Function} Configured merchant name formatter function
 */
export const create_merchant_name_formatter = (config) => {
  return ({ transaction_description, format }) =>
    format_merchant_name({
      transaction_description,
      format,
      config
    })
}
