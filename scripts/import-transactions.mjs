import path from 'path'
import { read_csv, get_finance_config } from '#libs-server'
import { isMain } from '#libs-shared'
import db from '#db'
import dayjs from 'dayjs'
import debug from 'debug'
import fs from 'fs/promises'

const log = debug('import-transactions')
debug.enable('import-transactions')

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

// Format detection rules for each bank format
const FORMAT_RULES = {
  chase: {
    detect: (transaction) =>
      (Object.prototype.hasOwnProperty.call(transaction, 'Type') ||
        Object.prototype.hasOwnProperty.call(
          transaction,
          'Transaction Type'
        )) &&
      Object.prototype.hasOwnProperty.call(transaction, 'Category'),
    required_fields: [
      'Transaction Date',
      'Post Date',
      'Description',
      'Category',
      'Type',
      'Amount'
    ],
    name: 'Chase'
  },
  capital_one: {
    detect: (transaction) =>
      (Object.prototype.hasOwnProperty.call(transaction, 'Debit') &&
        Object.prototype.hasOwnProperty.call(transaction, 'Credit')) ||
      (Object.prototype.hasOwnProperty.call(transaction, 'Transaction Date') &&
        Object.prototype.hasOwnProperty.call(transaction, 'Card No.')),
    required_fields: [
      'Transaction Date',
      'Posted Date',
      'Description',
      'Category',
      'Debit',
      'Credit'
    ],
    name: 'Capital One'
  },
  ally: {
    detect: (transaction) =>
      Object.prototype.hasOwnProperty.call(transaction, 'Time') &&
      Object.prototype.hasOwnProperty.call(transaction, 'Description'),
    required_fields: ['Date', 'Time', 'Amount', 'Type', 'Description'],
    name: 'Ally Bank'
  },
  amex: {
    detect: (transaction) =>
      Object.prototype.hasOwnProperty.call(transaction, 'Date') &&
      Object.prototype.hasOwnProperty.call(transaction, 'Description') &&
      !Object.prototype.hasOwnProperty.call(transaction, 'Type'),
    required_fields: ['Date', 'Description', 'Amount'],
    name: 'American Express'
  }
}

/**
 * Detects the format of a transaction based on its properties
 * @param {Object} transaction - The transaction data
 * @returns {string} - The detected format identifier
 */
const detect_format = (transaction) => {
  for (const [format, config] of Object.entries(FORMAT_RULES)) {
    if (config.detect(transaction)) {
      return format
    }
  }
  throw new Error('Unknown CSV format')
}

/**
 * Verifies if a CSV file meets the format requirements for supported banks
 * @param {string} file_path - Path to the CSV file
 * @returns {Promise<{is_valid: boolean, format: string|null, message: string}>}
 */
const verify_csv_format = async (file_path) => {
  try {
    // Read first row of CSV to check the headers
    const transactions = await read_csv(file_path, {
      mapHeaders: ({ header }) => header.trim()
    })

    if (!transactions || transactions.length === 0) {
      return {
        is_valid: false,
        format: null,
        message: 'CSV file is empty or could not be parsed'
      }
    }

    // Get the first transaction to check headers
    const first_transaction = transactions[0]

    // Try to detect the format
    let format
    try {
      format = detect_format(first_transaction)
    } catch (err) {
      console.error(err)
      return {
        is_valid: false,
        format: null,
        message: 'Could not determine CSV format based on headers'
      }
    }

    // Get format requirements
    const requirements = FORMAT_RULES[format]

    // Verify all required fields are present
    const missing_fields = requirements.required_fields.filter(
      (field) => !Object.prototype.hasOwnProperty.call(first_transaction, field)
    )

    if (missing_fields.length > 0) {
      return {
        is_valid: false,
        format,
        message: `CSV is missing required fields for ${
          requirements.name
        } format: ${missing_fields.join(', ')}`
      }
    }

    // Verify data consistency by checking a few rows
    const sample_size = Math.min(5, transactions.length)
    for (let i = 0; i < sample_size; i++) {
      try {
        const detected = detect_format(transactions[i])
        if (detected !== format) {
          return {
            is_valid: false,
            format,
            message: `Inconsistent data format detected in row ${i + 1}`
          }
        }
      } catch (err) {
        console.error(err)
        return {
          is_valid: false,
          format,
          message: `Invalid data in row ${i + 1}: ${err.message}`
        }
      }
    }

    return {
      is_valid: true,
      format,
      message: `Valid ${requirements.name} format detected`
    }
  } catch (err) {
    return {
      is_valid: false,
      format: null,
      message: `Error verifying CSV format: ${err.message}`
    }
  }
}

/**
 * Cleans and formats a merchant name based on the transaction format
 * @param {string} name - The raw merchant name
 * @param {string} format - The transaction format
 * @returns {string} - Cleaned merchant name
 */
const clean_merchant_name = async (name, format) => {
  const finance_config = await get_finance_config()
  return finance_config.format_merchant_name({
    transaction_description: name,
    format
  })
}

/**
 * Extracts the transaction amount with the correct sign based on format
 * @param {Object} transaction - The transaction data
 * @param {string} format - The transaction format
 * @returns {number|null} - The transaction amount or null if invalid
 */
const get_transaction_amount = (transaction, format) => {
  // Format-specific amount extraction
  switch (format) {
    case 'capital_one':
      // For Capital One, use Debit as negative, Credit as positive
      if (transaction.Debit) {
        return -parseFloat(transaction.Debit.trim())
      }
      return transaction.Credit ? parseFloat(transaction.Credit.trim()) : 0

    case 'chase':
      // Chase amounts are already signed correctly
      return parseFloat(transaction.Amount.trim())

    case 'amex':
      // Amex uses opposite convention - positive for debits (purchases), negative for credits
      // We need to flip the sign to match our convention
      return transaction.Amount ? -parseFloat(transaction.Amount.trim()) : null

    case 'ally':
    default:
      // For other formats, use Amount field as is
      return transaction.Amount ? parseFloat(transaction.Amount.trim()) : null
  }
}

/**
 * Generates a unique transaction ID based on transaction data and format
 * @param {Object} params - Parameters
 * @param {Object} params.transaction - Transaction data
 * @param {string} params.format - Transaction format
 * @returns {string} - Unique transaction ID
 */
const generate_transaction_id = ({ transaction, format }) => {
  const components = [format]

  switch (format) {
    case 'ally':
      components.push(transaction.Date, transaction.Time, transaction.Amount)
      break
    case 'capital_one':
      components.push(
        transaction['Transaction Date'],
        transaction['Posted Date'],
        transaction.Debit || transaction.Credit,
        transaction['Card No.']
      )
      break
    case 'chase':
      components.push(
        transaction['Transaction Date'],
        transaction['Post Date'],
        transaction.Amount
      )
      break
    case 'amex':
      components.push(transaction.Date, transaction.Amount)
      break
    default:
      // Fallback for unknown formats
      components.push(JSON.stringify(transaction))
  }

  // Filter out any undefined/null components
  return components.filter((component) => component != null).join('_')
}

/**
 * Extracts standardized date information from a transaction
 * @param {Object} transaction - The transaction data
 * @param {string} format - The transaction format
 * @returns {Object} - Object with date, time, and unix timestamp
 */
const extract_transaction_date = (transaction, format) => {
  let date_str = ''
  let time_str = null

  // Extract date string based on format
  if (format === 'ally') {
    date_str = transaction.Date
    time_str = transaction.Time
  } else if (format === 'capital_one') {
    date_str = transaction['Transaction Date']
  } else if (format === 'chase') {
    date_str = transaction['Transaction Date']
  } else if (format === 'amex') {
    date_str = transaction.Date
  }

  // Standardize date format to YYYY-MM-DD
  const date_parts = date_str.split('/')
  if (date_parts.length === 3) {
    // Handle MM/DD/YYYY format
    const month = date_parts[0].padStart(2, '0')
    const day = date_parts[1].padStart(2, '0')
    let year = date_parts[2]
    // Handle 2-digit years
    if (year.length === 2) {
      year = `20${year}` // Assuming all years are in the 2000s
    }
    date_str = `${year}-${month}-${day}`
  }

  // Calculate unix timestamp from the date
  const date_obj = dayjs(date_str)
  const unix_timestamp = Math.floor(date_obj.valueOf() / 1000)

  return {
    date: date_str,
    time: time_str,
    unix_timestamp
  }
}

/**
 * Determines the transaction type based on amount and categories
 * @param {number} amount - Transaction amount
 * @param {Array<string>} categories - Transaction categories
 * @returns {string} - Transaction type (purchase, income, or transfer)
 */
const determine_transaction_type = (amount, categories) => {
  if (categories.some((cat) => cat.includes('transfer'))) {
    return 'transfer'
  }
  return amount > 0 ? 'income' : 'purchase'
}

/**
 * Creates transaction links for from/to paths
 * @param {Object} params - Link parameters
 * @returns {Object} - Object containing from_link and to_link
 */
const create_transaction_links = async ({
  transaction_description,
  transaction_type,
  format,
  amount
}) => {
  const finance_config = await get_finance_config()
  const counterparty_link = await finance_config.format_link({
    transaction_description,
    type: transaction_type,
    format
  })

  // For purchases (negative amounts), money comes from user's account
  // For income (positive amounts), money goes to user's account
  // TODO support using actual account links instead of hardcoding primary
  return {
    from_link: amount < 0 ? '/account/primary' : counterparty_link,
    to_link: amount < 0 ? counterparty_link : '/account/primary'
  }
}

/**
 * Saves a transaction to the database
 * @param {Object} transaction - The transaction data
 * @param {string} format - The transaction format
 * @returns {Promise<boolean>} - Whether the transaction was saved successfully
 */
const save_transaction_to_db = async (transaction, format) => {
  try {
    const finance_config = await get_finance_config()
    const merchant_name = await clean_merchant_name(
      transaction.Description,
      format
    )
    const amount = get_transaction_amount(transaction, format)

    if (amount === null || isNaN(amount)) {
      log(`Warning: Invalid amount for merchant: ${merchant_name}`)
      return false
    }

    const transaction_id = generate_transaction_id({ transaction, format })

    // Extract transaction date, time and unix timestamp
    const { date, time, unix_timestamp } = extract_transaction_date(
      transaction,
      format
    )

    // Determine if this is a transfer transaction
    const is_transfer = finance_config.is_transfer_transaction(
      transaction.Description,
      format,
      transaction.Type // For formats like Chase that use a Type field
    )

    // Get categories for the merchant
    const categories = is_transfer
      ? ['transfer']
      : finance_config.get_merchant_categories(merchant_name)

    // Determine transaction type (purchase, income, or transfer)
    const transaction_type = determine_transaction_type(amount, categories)

    // Create transaction links
    const { from_link, to_link } = await create_transaction_links({
      transaction_description: transaction.Description,
      transaction_type,
      format,
      amount
    })

    // Create a unique link for the transaction
    const link = `/transaction/${transaction_id}`

    // Create transaction info object
    const transaction_details = {
      format,
      merchant: merchant_name,
      amount,
      categories,
      type: transaction.Type,
      transaction_date: date,
      original_data: { ...transaction }
    }

    // Add transaction time if available
    if (time) {
      transaction_details.transaction_time = time
      transaction_details.transaction_date_time = `${date}T${time}`
    }

    // Add format-specific fields
    if (format === 'chase' && transaction.Category) {
      transaction_details.chase_category = transaction.Category
    }

    // Insert or update the transaction in the database
    await db('transactions')
      .insert({
        link,
        transaction_type,
        from_link,
        from_amount: amount < 0 ? amount : -amount,
        from_symbol: 'USD',
        to_link,
        to_amount: amount < 0 ? -amount : amount,
        to_symbol: 'USD',
        transaction_unix: unix_timestamp,
        transaction_date: date,
        tx_id: transaction_id,
        transaction_time: time,
        description: merchant_name,
        categories,
        original_data: transaction_details.original_data
      })
      .onConflict('link')
      .merge()

    return true
  } catch (error) {
    log(`Error saving transaction: ${error.message}`)
    console.error(error)
    return false
  }
}

/**
 * Analyzes transactions from a CSV file and updates the database
 * @param {string} file_path - Path to the CSV file
 * @param {number} year - Year of the transactions
 * @param {string} [detected_format] - Format detected during verification
 * @returns {Promise<number>} - Number of processed transactions
 */
const import_transactions = async (file_path, year, detected_format = null) => {
  log(`Importing transactions from ${file_path}`)

  // Read and parse CSV file
  const transactions = await read_csv(file_path, {
    mapHeaders: ({ header }) => header.trim()
  }).catch((err) => {
    return handle_error(err, `Failed to parse CSV file ${file_path}`, true)
  })

  if (!transactions || !Array.isArray(transactions)) {
    throw new Error('Invalid transaction data')
  }

  if (transactions.length === 0) {
    throw new Error('No transactions found in file')
  }

  // Use detected format if provided, otherwise detect from first transaction
  let format
  try {
    format = detected_format || detect_format(transactions[0])
    log(`Using format: ${format}`)
  } catch (err) {
    return handle_error(err, `Failed to detect format for ${file_path}`, true)
  }

  // Process new transactions
  let new_transactions_count = 0

  // Process each transaction
  for (const transaction of transactions) {
    if (!transaction || Object.keys(transaction).length === 0) {
      log('Warning: Invalid or empty transaction record, skipping')
      continue
    }

    // Save transaction to database
    const success = await save_transaction_to_db(transaction, format)

    if (success) {
      new_transactions_count++
    }
  }

  log(`Processed ${new_transactions_count} new transactions`)
  return new_transactions_count
}

/**
 * Detects the year from a filename
 * @param {string} filename - The filename to analyze
 * @returns {number} - The detected year or current year if not found
 */
const detect_year_from_filename = (filename) => {
  const year_match = filename.match(/(?:^|\D)(20\d{2})(?:\D|$)/)
  if (year_match) {
    return parseInt(year_match[1])
  }
  return new Date().getFullYear()
}

/**
 * Finds all CSV files in a directory
 * @param {string} directory - Directory to search
 * @returns {Promise<string[]>} - Array of CSV file paths
 */
const find_csv_files = async (directory) => {
  const files = await fs.readdir(directory)
  return files
    .filter((file) => file.toLowerCase().endsWith('.csv'))
    .map((file) => path.join(directory, file))
}

/**
 * Main function to import transactions from CSV files
 */
const main = async () => {
  try {
    const import_dir = 'import-data'

    // Check if import directory exists
    try {
      await fs.access(import_dir)
    } catch (err) {
      return handle_error(
        err,
        `Import directory "${import_dir}" does not exist or is not accessible`,
        true
      )
    }

    const csv_files = await find_csv_files(import_dir)

    if (csv_files.length === 0) {
      throw new Error('No CSV files found in import-data directory')
    }

    const processed_years = new Set()
    const total_files = csv_files.length
    let skipped_files = 0
    let processed_files = 0

    for (const file_path of csv_files) {
      const file_name = path.basename(file_path)
      const year = detect_year_from_filename(file_name)

      // Verify the CSV format before processing
      log(`\nVerifying ${file_name}...`)
      const verification_result = await verify_csv_format(file_path)

      if (!verification_result.is_valid) {
        log(`❌ Skipping ${file_name}: ${verification_result.message}`)
        skipped_files++
        continue
      }

      log(`✅ ${verification_result.message}`)
      log(`Processing ${file_name} for year ${year}...`)

      try {
        await import_transactions(file_path, year, verification_result.format)
        processed_files++
        processed_years.add(year)
      } catch (err) {
        handle_error(err, `Error processing ${file_name}`)
        skipped_files++
        continue
      }
    }

    log(`\nProcessed ${processed_files} files successfully.`)
    if (skipped_files > 0) {
      log(
        `Skipped ${skipped_files} out of ${total_files} files due to errors or invalid format.`
      )
    }

    if (processed_years.size > 0) {
      log(
        `\nSuccessfully imported transactions for years: ${Array.from(
          processed_years
        ).join(', ')}`
      )
    } else {
      log('\nNo transactions were processed successfully.')
    }

    return 0
  } catch (err) {
    handle_error(err, 'Unhandled error in main function')
    return 1
  }
}

if (isMain(import.meta.url)) {
  main().then((exit_code) => process.exit(exit_code))
}

export { import_transactions, verify_csv_format, detect_format }
