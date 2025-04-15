import debug from 'debug'
import dayjs from 'dayjs'
import Table from 'cli-table3'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { isMain } from '#libs-shared'
import { get_parent_categories } from '#libs-server/transaction-categories.mjs'
import db from '#db'

const log = debug('analyze-transactions')
debug.enable('analyze-transactions')

/**
 * Utility function for error handling and logging
 * @param {Error} error - The error to handle
 * @param {string} context - Context message describing where the error occurred
 * @param {boolean} [throw_error=false] - Whether to throw the error after logging
 * @returns {null} - Always returns null for error cases
 */
const handle_error = (error, context, throw_error = false) => {
  const error_message = `${context}: ${error.message}`
  log(error_message)
  console.error(error)

  if (throw_error) {
    throw new Error(error_message)
  }

  return null
}

// Analysis functions
/**
 * Generates a table of merchant transaction totals
 * @param {number} year - Year to analyze
 * @param {string|null} category_filter - Optional category to filter by
 * @returns {Table} - CLI table with merchant data
 */
const generate_table = async (year, category_filter = null) => {
  try {
    let query = db('transactions')
      .select(
        'to_link as merchant',
        db.raw('SUM(from_amount) as total'),
        db.raw('count(*) as count'),
        'categories'
      )
      .whereRaw('transaction_date >= ? AND transaction_date < ?', [
        `${year}-01-01`,
        `${year + 1}-01-01`
      ])

    if (category_filter) {
      query = query.where(function () {
        this.whereRaw('? = ANY(categories)', [category_filter]).orWhereRaw(
          'EXISTS (SELECT 1 FROM unnest(categories) cat WHERE cat LIKE ?)',
          [`${category_filter}.%`]
        )
      })
    }

    // Must be applied after the where conditions
    query = query.groupBy('to_link', 'categories')

    const results = await query

    const table = new Table({
      head: ['Merchant', 'Total', 'Count', 'Categories'],
      colWidths: [40, 15, 8, 30],
      style: {
        head: ['cyan'],
        border: ['gray']
      }
    })

    // Group results by merchant for display
    const merchant_data = {}
    results.forEach((row) => {
      const merchant = row.merchant
      if (!merchant_data[merchant]) {
        merchant_data[merchant] = {
          total: 0,
          count: 0,
          categories: new Set()
        }
      }

      merchant_data[merchant].total += Number(row.total)
      merchant_data[merchant].count += Number(row.count)
      const categories = row.categories || []
      categories.forEach((cat) => merchant_data[merchant].categories.add(cat))
    })

    // Add to table
    Object.entries(merchant_data)
      .sort(([, a], [, b]) => Math.abs(b.total) - Math.abs(a.total))
      .forEach(([merchant, data]) => {
        const formatted_total = data.total.toFixed(2)
        const categories = Array.from(data.categories)
          .map((cat) => cat.split('.').pop())
          .join(', ')
        table.push([merchant, `$${formatted_total}`, data.count, categories])
      })

    return table
  } catch (error) {
    console.error('Error generating table:', error)
    return new Table()
  }
}

/**
 * Generates a table of transaction totals by category
 * @param {number} year - Year to analyze
 * @param {string|null} category_filter - Optional category to filter by
 * @returns {Table} - CLI table with category data
 */
const generate_category_table = async (year, category_filter = null) => {
  try {
    // Base query to get all transactions for the year
    let transactions_query = db('transactions')
      .select('*')
      .whereRaw('transaction_date >= ? AND transaction_date < ?', [
        `${year}-01-01`,
        `${year + 1}-01-01`
      ])

    if (category_filter) {
      transactions_query = transactions_query.where(function () {
        this.whereRaw('? = ANY(categories)', [category_filter]).orWhereRaw(
          'EXISTS (SELECT 1 FROM unnest(categories) cat WHERE cat LIKE ?)',
          [`${category_filter}.%`]
        )
      })
    }

    const transactions = await transactions_query

    // Aggregate totals by category
    const category_totals = {}
    const category_counts = {}

    transactions.forEach((transaction) => {
      // Calculate amount
      const amount = Number(transaction.from_amount)
        ? -Number(transaction.from_amount)
        : Number(transaction.to_amount || 0)

      // Process each category
      const categories = transaction.categories || []
      categories.forEach((category) => {
        // Add to all parent categories as well
        get_parent_categories(category).forEach((parent_category) => {
          category_totals[parent_category] =
            (category_totals[parent_category] || 0) + amount
          category_counts[parent_category] =
            (category_counts[parent_category] || 0) + 1
        })
      })
    })

    // Create the table
    const table = new Table({
      head: ['Category', 'Total', 'Count'],
      colWidths: [40, 15, 8],
      style: {
        head: ['cyan'],
        border: ['gray']
      }
    })

    // Add to table
    Object.entries(category_totals)
      .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
      .forEach(([category, total]) => {
        const formatted_total = total.toFixed(2)
        table.push([category, `$${formatted_total}`, category_counts[category]])
      })

    return table
  } catch (error) {
    console.error('Error generating category table:', error)
    return new Table()
  }
}

/**
 * Generates a table of merchants within a specific category
 * @param {number} year - Year to analyze
 * @param {string} category - Category to filter by
 * @returns {Table} - CLI table with merchant data for the category
 */
const generate_merchants_by_category_table = async (year, category) => {
  try {
    // Get all transactions with this category
    // Updated to match parent categories as well
    const base_query = db('transactions')
      .select('*')
      .whereRaw('transaction_date >= ? AND transaction_date < ?', [
        `${year}-01-01`,
        `${year + 1}-01-01`
      ])

    // Modified query to handle parent categories
    // This matches both exact category matches and when the category is a parent
    const transactions = await base_query.where(function () {
      this.whereRaw('? = ANY(categories)', [category]).orWhereRaw(
        'EXISTS (SELECT 1 FROM unnest(categories) cat WHERE cat LIKE ?)',
        [`${category}.%`]
      )
    })

    // Group by merchant
    const merchant_category_data = {}

    transactions.forEach((transaction) => {
      const merchant = transaction.to_link
      const amount = Number(transaction.from_amount)
        ? -Number(transaction.from_amount)
        : Number(transaction.to_amount || 0)

      if (!merchant_category_data[merchant]) {
        merchant_category_data[merchant] = {
          total: 0,
          count: 0
        }
      }

      merchant_category_data[merchant].total += amount
      merchant_category_data[merchant].count++
    })

    // Create table
    const table = new Table({
      head: ['Merchant', 'Category Total', 'Count'],
      colWidths: [40, 15, 8],
      style: {
        head: ['cyan'],
        border: ['gray']
      }
    })

    // Add to table
    Object.entries(merchant_category_data)
      .sort(([, a], [, b]) => Math.abs(b.total) - Math.abs(a.total))
      .forEach(([merchant, data]) => {
        const formatted_total = data.total.toFixed(2)
        table.push([merchant, `$${formatted_total}`, data.count])
      })

    return table
  } catch (error) {
    console.error('Error generating merchants by category table:', error)
    return new Table()
  }
}

/**
 * Generates a table of uncategorized transactions
 * @param {number} year - Year to analyze
 * @returns {Object} - Object containing table and count
 */
const generate_uncategorized_transactions_table = async (year) => {
  try {
    // Get all transactions with uncategorized category
    const uncategorized_transactions = await db('transactions')
      .select('*')
      .whereRaw('transaction_date >= ? AND transaction_date < ?', [
        `${year}-01-01`,
        `${year + 1}-01-01`
      ])
      .whereRaw("'uncategorized' = ANY(categories)")
      .orderByRaw('GREATEST(from_amount, to_amount) DESC')

    // Create table
    const table = new Table({
      head: ['Merchant', 'Amount', 'Date', 'Description', 'Link'],
      colWidths: [30, 15, 20, 50, 30],
      style: {
        head: ['cyan'],
        border: ['gray']
      }
    })

    // Add to table
    uncategorized_transactions.forEach((transaction) => {
      const amount = Number(transaction.from_amount)
        ? -Number(transaction.from_amount)
        : Number(transaction.to_amount || 0)

      const formatted_amount = amount.toFixed(2)
      const formatted_date = dayjs(transaction.transaction_date).format(
        'YYYY-MM-DD'
      )

      let description = transaction.description || ''
      if (transaction.original_data && transaction.original_data.Description) {
        description = transaction.original_data.Description
      }

      table.push([
        transaction.to_link,
        `$${formatted_amount}`,
        formatted_date,
        description.substring(0, 45),
        transaction.link
      ])
    })

    return {
      table,
      count: uncategorized_transactions.length
    }
  } catch (error) {
    console.error('Error generating uncategorized transactions table:', error)
    return {
      table: new Table(),
      count: 0
    }
  }
}

/**
 * Calculates total spending excluding transfers and investments
 * @param {number} year - Year to analyze
 * @returns {number} - Total spending amount
 */
const calculate_total_excluding_transfers_investments = async (year) => {
  try {
    // Get all transactions for the year
    const transactions = await db('transactions')
      .select('*')
      .whereRaw('transaction_date >= ? AND transaction_date < ?', [
        `${year}-01-01`,
        `${year + 1}-01-01`
      ])

    // Calculate total excluding transfers and investments
    let total = 0

    transactions.forEach((transaction) => {
      // Skip if any category is a transfer or investment
      const has_excluded_category = (transaction.categories || []).some(
        (category) => {
          const top_level = category.split('.')[0]
          return top_level === 'transfer' || top_level === 'investment'
        }
      )

      if (!has_excluded_category) {
        const amount = Number(transaction.from_amount)
          ? -Number(transaction.from_amount)
          : Number(transaction.to_amount || 0)
        total += amount
      }
    })

    return total
  } catch (error) {
    console.error('Error calculating total:', error)
    return 0
  }
}

/**
 * Calculates the total amount for a specific category
 * @param {number} year - Year to analyze
 * @param {string} category - Category to calculate total for
 * @returns {number} - Total amount for the category
 */
const calculate_category_total = async (year, category) => {
  try {
    // Get all transactions for the year with this category
    const transactions = await db('transactions')
      .select('*')
      .whereRaw('transaction_date >= ? AND transaction_date < ?', [
        `${year}-01-01`,
        `${year + 1}-01-01`
      ])
      .where(function () {
        this.whereRaw('? = ANY(categories)', [category]).orWhereRaw(
          'EXISTS (SELECT 1 FROM unnest(categories) cat WHERE cat LIKE ?)',
          [`${category}.%`]
        )
      })

    // Sum the totals
    let total = 0
    transactions.forEach((transaction) => {
      const amount = Number(transaction.from_amount)
        ? -Number(transaction.from_amount)
        : Number(transaction.to_amount || 0)
      total += amount
    })

    return total
  } catch (error) {
    console.error('Error calculating category total:', error)
    return 0
  }
}

/**
 * Analyzes transactions for specified years or all years in the database
 * @param {Object} options - Analysis options
 * @param {Array<number>|null} options.years - Years to analyze or null for all years
 * @param {string|null} options.category - Category to filter by
 * @param {boolean} options.uncategorized_only - Whether to show only uncategorized transactions
 * @returns {Promise<number>} - Exit code
 */
const analyze_all_transactions = async ({
  years = null,
  category = null,
  uncategorized_only = false
}) => {
  try {
    // If no years specified, get all years from the database
    let years_to_analyze = years || []
    if (years_to_analyze.length === 0) {
      const years_result = await db('transactions')
        .select(db.raw('DISTINCT EXTRACT(YEAR FROM transaction_date) as year'))
        .orderBy('year')

      years_to_analyze = years_result.map((row) => parseInt(row.year))
    }

    if (years_to_analyze.length === 0) {
      log('No transaction data found in the database.')
      return 0
    }

    log('\n===== TRANSACTION SUMMARIES =====')

    for (const year of years_to_analyze) {
      log(`\n\n========= YEAR ${year} SUMMARY =========`)

      // Output total excluding transfers and investments
      const total_excluding_transfers =
        await calculate_total_excluding_transfers_investments(year)
      log('\n== TOTAL SPENDING (EXCLUDING TRANSFERS & INVESTMENTS) ==')
      log(`$${total_excluding_transfers.toFixed(2)}`)

      // If only showing uncategorized transactions, skip the rest of the reports
      if (uncategorized_only) {
        log('\n== UNCATEGORIZED TRANSACTIONS ==')
        const uncategorized_result =
          await generate_uncategorized_transactions_table(year)
        if (uncategorized_result.count > 0) {
          log(uncategorized_result.table.toString())
          log(`Total uncategorized transactions: ${uncategorized_result.count}`)
        } else {
          log('No uncategorized transactions found.')
        }
        continue
      }

      // If a specific category is provided, show detailed breakdown
      if (category) {
        // Main category table
        log(`\n== TRANSACTIONS FOR CATEGORY: ${category} ==`)
        const category_merchants_table =
          await generate_merchants_by_category_table(year, category)
        log(category_merchants_table.toString())

        // Calculate the total for this category
        const category_total = await calculate_category_total(year, category)
        log(`Total for ${category}: $${category_total.toFixed(2)}`)

        // Find all transactions with this category to identify co-occurring categories
        const transactions_with_category = await db('transactions')
          .select('*')
          .whereRaw('transaction_date >= ? AND transaction_date < ?', [
            `${year}-01-01`,
            `${year + 1}-01-01`
          ])
          .where(function () {
            this.whereRaw('? = ANY(categories)', [category]).orWhereRaw(
              'EXISTS (SELECT 1 FROM unnest(categories) cat WHERE cat LIKE ?)',
              [`${category}.%`]
            )
          })

        // Find all unique categories that co-occur with the specified category
        const co_occurring_categories = new Set()
        transactions_with_category.forEach((transaction) => {
          const categories = transaction.categories || []
          categories.forEach((cat) => {
            // Skip the main category we're already showing
            if (cat !== category && !cat.startsWith(`${category}.`)) {
              co_occurring_categories.add(cat)
            }
          })
        })

        // For each co-occurring category, show a table of merchants
        if (co_occurring_categories.size > 0) {
          log(
            `\n== TRANSACTIONS BY CO-OCCURRING CATEGORIES WITH ${category} ==`
          )

          for (const co_cat of Array.from(co_occurring_categories).sort()) {
            log(`\n= ${category} + ${co_cat} =`)

            // Find transactions that have both categories
            const merchants_data = {}
            let sub_total = 0

            transactions_with_category.forEach((transaction) => {
              if (transaction.categories.includes(co_cat)) {
                const merchant = transaction.to_link
                const amount = Number(transaction.from_amount)
                  ? -Number(transaction.from_amount)
                  : Number(transaction.to_amount || 0)

                if (!merchants_data[merchant]) {
                  merchants_data[merchant] = {
                    total: 0,
                    count: 0
                  }
                }

                merchants_data[merchant].total += amount
                merchants_data[merchant].count++
                sub_total += amount
              }
            })

            // Build a table for this co-occurring category
            const co_cat_table = new Table({
              head: ['Merchant', 'Total', 'Count'],
              colWidths: [40, 15, 8],
              style: {
                head: ['cyan'],
                border: ['gray']
              }
            })

            // Add merchants to the table
            Object.entries(merchants_data)
              .sort(([, a], [, b]) => Math.abs(b.total) - Math.abs(a.total))
              .forEach(([merchant, data]) => {
                const formatted_total = data.total.toFixed(2)
                co_cat_table.push([merchant, `$${formatted_total}`, data.count])
              })

            // Display table and total if there are entries
            if (Object.keys(merchants_data).length > 0) {
              log(co_cat_table.toString())
              log(`Total for ${category} + ${co_cat}: $${sub_total.toFixed(2)}`)
            } else {
              log(`No transactions found with both ${category} and ${co_cat}`)
            }
          }
        } else {
          log('\nNo co-occurring categories found with this category')
        }

        continue
      }

      // Output totals by merchant
      log('\n== TOTALS BY MERCHANT ==')
      const merchant_table = await generate_table(year)
      log(merchant_table.toString())

      // Output totals by category
      log('\n== TOTALS BY CATEGORY ==')
      const category_table = await generate_category_table(year)
      log(category_table.toString())

      // Output uncategorized transactions
      log('\n== UNCATEGORIZED TRANSACTIONS ==')
      const uncategorized_result =
        await generate_uncategorized_transactions_table(year)
      if (uncategorized_result.count > 0) {
        log(uncategorized_result.table.toString())
        log(`Total uncategorized transactions: ${uncategorized_result.count}`)
      } else {
        log('No uncategorized transactions found.')
      }

      // Output merchants by top-level categories
      log('\n== MERCHANTS BY CATEGORY ==')

      // Get all unique top-level categories
      const categories_result = await db('transactions')
        .select(db.raw('DISTINCT UNNEST(categories) as category'))
        .whereRaw('transaction_date >= ? AND transaction_date < ?', [
          `${year}-01-01`,
          `${year + 1}-01-01`
        ])

      const top_categories = new Set()
      categories_result.forEach((row) => {
        const top_level = row.category.split('.')[0]
        top_categories.add(top_level)
      })

      // Output merchants for each top-level category
      for (const cat of Array.from(top_categories).sort()) {
        log(`\n= CATEGORY: ${cat} =`)
        const category_merchants_table =
          await generate_merchants_by_category_table(year, cat)
        log(category_merchants_table.toString())
      }
    }

    return 0
  } catch (err) {
    handle_error(err, 'Error generating transaction analysis')
    return 1
  }
}

/**
 * Main function for transaction analysis
 */
const main = async () => {
  try {
    // Set up command line arguments with yargs
    const argv = yargs(hideBin(process.argv))
      .usage('Usage: $0 [options]')
      .option('category', {
        alias: 'c',
        describe: 'Filter by a specific category',
        type: 'string'
      })
      .option('uncategorized', {
        alias: 'u',
        describe: 'Show only uncategorized transactions',
        type: 'boolean',
        default: false
      })
      .option('year', {
        alias: 'y',
        describe: 'Year to analyze (can be specified multiple times)',
        type: 'number',
        array: true
      })
      .example('$0', 'Analyze all years')
      .example('$0 --year 2022 --year 2023', 'Analyze specific years')
      .example(
        '$0 --category food --year 2023',
        'Show only food expenses for 2023'
      )
      .example('$0 --uncategorized', 'Show only uncategorized transactions')
      .help().argv

    // Get years from the --year option
    const years = argv.year || []

    // Validate years
    const valid_years = years.filter(
      (year) => !isNaN(year) && year >= 1900 && year <= 2100
    )

    if (years.length > 0 && valid_years.length === 0) {
      log('No valid years specified. Years should be between 1900 and 2100.')
      return 1
    }

    // Log analysis settings
    if (valid_years.length > 0) {
      log(`Analyzing transactions for years: ${valid_years.join(', ')}`)
    } else {
      log('Analyzing transactions for all years in the database')
    }

    if (argv.category) {
      log(`Filtering by category: ${argv.category}`)
    }

    if (argv.uncategorized) {
      log('Showing only uncategorized transactions')
    }

    // Run analysis with provided options
    return await analyze_all_transactions({
      years: valid_years,
      category: argv.category,
      uncategorized_only: argv.uncategorized
    })
  } catch (err) {
    handle_error(err, 'Unhandled error in main function')
    return 1
  }
}

if (isMain(import.meta.url)) {
  main().then((exit_code) => process.exit(exit_code))
}

export {
  analyze_all_transactions,
  generate_table,
  generate_category_table,
  generate_merchants_by_category_table,
  generate_uncategorized_transactions_table,
  calculate_total_excluding_transfers_investments,
  calculate_category_total
}
