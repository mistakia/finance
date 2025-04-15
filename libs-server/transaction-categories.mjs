// Helper function to get all subcategories of a category object
const get_all_subcategories = (category_obj) => {
  const categories = new Set()

  const traverse = (obj, prefix = '') => {
    if (!obj || typeof obj !== 'object') return

    Object.keys(obj).forEach((key) => {
      const full_path = prefix ? `${prefix}.${key}` : key
      categories.add(full_path)
      if (
        obj[key] &&
        typeof obj[key] === 'object' &&
        Object.keys(obj[key]).length > 0
      ) {
        traverse(obj[key], full_path)
      }
    })
  }

  traverse(category_obj)
  return Array.from(categories)
}

/**
 * Get categories for a merchant based on configured rules
 * @param {string} merchant_name - The merchant name to categorize
 * @param {Object} config - Configuration object with rules
 * @returns {Array} Array of category paths that match the merchant
 */
const get_merchant_categories = (merchant_name, config) => {
  if (!merchant_name || !config?.rules) return []

  const categories = new Set()

  config.rules.forEach((rule) => {
    if (rule.pattern && rule.pattern.test(merchant_name)) {
      rule.categories.forEach((category) => categories.add(category))
    }
  })

  return Array.from(categories)
}

/**
 * Get all parent categories for a given category path
 * @param {string} category - Category path (e.g. 'food.groceries')
 * @returns {Array} Array of parent category paths
 */
export const get_parent_categories = (category) => {
  if (!category) return []

  const parents = new Set()
  const parts = category.split('.')
  let current = ''

  parts.forEach((part) => {
    current = current ? `${current}.${part}` : part
    parents.add(current)
  })

  return Array.from(parents)
}

/**
 * Check if a transaction is a transfer based on configured patterns
 * @param {string} description - Transaction description
 * @param {string} format - Transaction format (ally, chase, etc.)
 * @param {string} type - Transaction type field (for special cases like Chase)
 * @param {Object} config - Configuration object with transfer patterns
 * @returns {boolean} Whether the transaction is a transfer
 */
const is_transfer_transaction = (description, format, type = null, config) => {
  if (!description || !format || !config?.transfers) return false

  // For Chase, check the Type field
  if (format === 'chase' && type === config.transfers.chase_payment_type) {
    return true
  }

  // Get patterns for the specified format
  const patterns = config.transfers[format]
  if (!patterns || !Array.isArray(patterns)) return false

  // Test against each pattern
  return patterns.some((pattern) => pattern.test(description))
}

/**
 * Factory function to create category-related functions with configuration applied
 * @param {Object} config - Configuration object
 * @returns {Object} Object containing category functions and data
 */
export const create_category_functions = (config) => {
  if (!config?.categories) {
    throw new Error('Invalid configuration: categories object is required')
  }

  // Get all categories including parent categories
  const all_categories = get_all_subcategories(config.categories)

  return {
    get_all_subcategories: (category_obj) =>
      get_all_subcategories(category_obj),
    get_merchant_categories: (merchant_name) =>
      get_merchant_categories(merchant_name, config),
    is_transfer_transaction: (description, format, type) =>
      is_transfer_transaction(description, format, type, config),
    ALL_CATEGORIES: all_categories,
    CATEGORIES: config.categories
  }
}
