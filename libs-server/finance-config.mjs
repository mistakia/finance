import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'

// Import the formatters and category functions
import { create_merchant_name_formatter } from './format-merchant-name.mjs'
import { create_link_formatter } from './format-link.mjs'
import { create_category_functions } from './transaction-categories.mjs'

// Import default configurations
import default_categories from '#config/defaults/categories.mjs'
import default_rules from '#config/defaults/rules.mjs'
import default_transfers from '#config/defaults/transfers.mjs'
import default_merchants from '#config/defaults/merchants.mjs'
import default_links from '#config/defaults/links.mjs'

// Get the current directory path for loading user configs
const current_file_path = fileURLToPath(import.meta.url)
const base_dir = dirname(dirname(current_file_path)) // Go up two levels to get to project root
const config_dir = join(base_dir, 'config')
const user_config_dir = join(config_dir, 'user')

// Singleton finance config instance
let finance_config

/**
 * Deep merge two objects
 * @param {Object} target - Target object to merge into
 * @param {Object} source - Source object to merge from
 * @returns {Object} Merged object
 */
const deep_merge = (target, source) => {
  if (!source) return target
  if (!target) return { ...source }

  const output = { ...target }

  if (source && typeof source === 'object' && !Array.isArray(source)) {
    Object.keys(source).forEach((key) => {
      if (
        source[key] &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key])
      ) {
        if (!(key in target)) {
          output[key] = source[key]
        } else {
          output[key] = deep_merge(target[key], source[key])
        }
      } else {
        output[key] = source[key]
      }
    })
  }

  return output
}

/**
 * Try to import a module, return null if not found
 * @param {string} module_path - Path to the module
 * @returns {Object|null} The imported module default export or null
 */
const try_import = async (module_path) => {
  try {
    if (fs.existsSync(module_path)) {
      return (await import(module_path)).default
    }
  } catch (error) {
    console.log(`Warning: Error importing ${module_path}: ${error.message}`)
  }
  return null
}

/**
 * Process category additions and removals
 * @param {Object} base_categories - Base categories object
 * @param {Object} user_config - User configuration with add/remove operations
 * @returns {Object} Processed categories object
 */
const process_category_config = (base_categories, user_config) => {
  if (!user_config) return base_categories

  const result = { ...base_categories }

  // Process additions
  if (user_config.add && typeof user_config.add === 'object') {
    Object.entries(user_config.add).forEach(([key, value]) => {
      if (result[key]) {
        // Merge with existing category
        result[key] = deep_merge(result[key], value)
      } else {
        // Add new category
        result[key] = value
      }
    })
  }

  // Process removals
  if (user_config.remove && Array.isArray(user_config.remove)) {
    user_config.remove.forEach((path) => {
      if (!path || typeof path !== 'string') return

      const parts = path.split('.')

      if (parts.length === 1) {
        // Remove top-level category
        delete result[parts[0]]
      } else {
        // Remove nested category
        let current = result
        for (let i = 0; i < parts.length - 1; i++) {
          if (current[parts[i]]) {
            current = current[parts[i]]
          } else {
            // Path doesn't exist, nothing to remove
            return
          }
        }

        // Remove the last part
        delete current[parts[parts.length - 1]]
      }
    })
  }

  return result
}

/**
 * Merge rule configurations with additions and removals
 * @param {Array} base_rules - Base rules array
 * @param {Object} user_rules - User rules with add/remove operations
 * @returns {Array} Merged rules array
 */
const merge_rules = (base_rules, user_rules) => {
  if (!user_rules) return base_rules
  if (!base_rules || !Array.isArray(base_rules)) return []

  // Start with base rules
  const merged_rules = [...base_rules]

  // Handle additions
  if (user_rules.add && Array.isArray(user_rules.add)) {
    merged_rules.push(
      ...user_rules.add.filter(
        (rule) => rule && rule.pattern && Array.isArray(rule.categories)
      )
    )
  }

  // Handle removals by pattern (exact string match of the pattern source)
  if (user_rules.remove && Array.isArray(user_rules.remove)) {
    user_rules.remove.forEach((pattern_to_remove) => {
      if (!pattern_to_remove) return

      const pattern_str = pattern_to_remove.toString()

      // Find the index of rule with matching pattern
      const index = merged_rules.findIndex(
        (rule) => rule.pattern && rule.pattern.toString() === pattern_str
      )

      if (index !== -1) {
        merged_rules.splice(index, 1)
      }
    })
  }

  return merged_rules
}

/**
 * Load and merge configurations
 * @returns {Object} Merged configuration
 */
const load_config = async () => {
  try {
    // Try to import user configs
    const user_categories = await try_import(
      join(user_config_dir, 'categories.mjs')
    )
    const user_rules = await try_import(join(user_config_dir, 'rules.mjs'))
    const user_transfers = await try_import(
      join(user_config_dir, 'transfers.mjs')
    )
    const user_merchants = await try_import(
      join(user_config_dir, 'merchants.mjs')
    )
    const user_links = await try_import(join(user_config_dir, 'links.mjs'))
    const home_depot_job_mappings = await try_import(
      join(user_config_dir, 'home_depot_job_mappings.mjs')
    )

    // Create the final config by merging defaults with user configs
    return {
      categories: process_category_config(default_categories, user_categories),
      rules: merge_rules(default_rules, user_rules),
      transfers: deep_merge(default_transfers, user_transfers),
      merchants: deep_merge(default_merchants, user_merchants),
      links: deep_merge(default_links, user_links),
      home_depot_job_mappings: home_depot_job_mappings || {}
    }
  } catch (error) {
    console.error('Error loading config:', error)

    // Return defaults if there's an error
    return {
      categories: default_categories,
      rules: default_rules,
      transfers: default_transfers,
      merchants: default_merchants,
      links: default_links,
      home_depot_job_mappings: {}
    }
  }
}

/**
 * Create a unified finance config with all configured functions
 * This is the main entry point for accessing the finance functionality
 * with configuration applied
 * @returns {Object} Finance config object with all configured functions
 */
export const create_finance_config = async () => {
  // Load configuration (merges defaults with user overrides)
  const config = await load_config()

  // Create specialized functions with configuration applied
  const merchant_formatter = create_merchant_name_formatter(config)
  const link_formatter = create_link_formatter(config)
  const category_config = create_category_functions(config)

  // Return a complete API with all functions
  return {
    // Merchant name formatting
    format_merchant_name: merchant_formatter,

    // Link formatting
    format_link: link_formatter,

    // Category-related functions
    ...category_config,

    // Raw configuration (useful for inspection/debugging)
    config
  }
}

/**
 * Get the default singleton finance config instance
 * Creates it on first use
 * @returns {Object} Finance config object
 */
export const get_finance_config = async () => {
  if (!finance_config) {
    finance_config = await create_finance_config()
  }
  return finance_config
}

/**
 * Reset the singleton instance, forcing reconfiguration
 * Useful when configuration has changed
 */
export const reset_finance_config = () => {
  finance_config = null
}
