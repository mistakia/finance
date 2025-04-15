import fs from 'fs'
import path from 'path'
import debug from 'debug'
import dayjs from 'dayjs'
import { isMain } from '#libs-shared'
import { read_csv, get_finance_config } from '#libs-server'
import db from '#db'

const log = debug('process_home_depot_items')
debug.enable('process_home_depot_items')

// Constants
const FILE_PATH = {
  dir: 'import-data',
  file: '2024_home_depot_details.csv'
}
const SALES_TAX_RATE = 1.06
const MATCH_THRESHOLD = 0.1
const AMOUNT_TOLERANCE = 1.0

// Helper functions
const parse_price = (price_str) =>
  parseFloat((price_str || '0').replace(/[$,]/g, ''))

const format_transaction_date = (date) => {
  if (!date) return ''

  // Convert to string if date is not already a string
  const date_str = typeof date === 'string' ? date : String(date)

  return dayjs(date_str).format('YYYY-MM-DD')
}

const calculate_transaction_total = (items) => {
  const subtotal = items.reduce((sum, item) => {
    const net_unit_price = parse_price(item['Net Unit Price'])
    const quantity = Number(item.Quantity)
    return sum + net_unit_price * quantity
  }, 0)

  return subtotal * SALES_TAX_RATE
}

const read_csv_file = async (file_path) => {
  if (!fs.existsSync(file_path)) {
    return []
  }

  return read_csv(file_path, {
    mapHeaders: ({ header }) => header.trim()
  })
}

const run = async () => {
  // Setup file path
  const import_data_dir = path.join(process.cwd(), FILE_PATH.dir)
  const hd_csv_path = path.join(import_data_dir, FILE_PATH.file)

  if (!fs.existsSync(hd_csv_path)) {
    log(`Home Depot CSV not found at ${hd_csv_path}`)
    return
  }

  // Read Home Depot CSV file
  const home_depot_records = await read_csv_file(hd_csv_path)
  log(`Parsed ${home_depot_records.length} Home Depot transaction items`)

  // Process data
  const transactions_by_key = group_records_by_transaction(home_depot_records)
  log(`Grouped into ${Object.keys(transactions_by_key).length} unique receipts`)

  const { matched_transactions, matched_count } = await match_transactions(
    transactions_by_key
  )

  // Calculate unmatched transactions
  const unmatched_keys = Object.keys(transactions_by_key).filter(
    (key) => !matched_transactions.has(key)
  )
  log(
    `Matched ${matched_count} Home Depot transactions with transactions in database`
  )
  log(`${unmatched_keys.length} Home Depot receipts were not matched`)

  // Log unmatched transactions
  log_unmatched_transactions(unmatched_keys, transactions_by_key)
}

const group_records_by_transaction = (records) => {
  const transactions = {}

  records.forEach((record) => {
    const key = `${record.Date}_${record['Transaction ID']}`
    if (!transactions[key]) transactions[key] = []
    transactions[key].push(record)
  })

  return transactions
}

const match_transactions = async (transactions_by_key) => {
  // Find all Home Depot transactions in database
  const home_depot_transactions = await db('transactions')
    .select('*')
    .where(function () {
      this.where('to_link', 'like', '/merchant/home_depot%').orWhere(
        'from_link',
        'like',
        '/merchant/home_depot%'
      )
    })

  log(
    `Found ${home_depot_transactions.length} Home Depot transactions in database`
  )

  // Track matches
  let matched_count = 0
  const matched_transactions = new Set()
  const matched_transaction_keys = new Set()
  const matched_receipt_ids = new Set()

  // First pass: find 1:1 matches (exact or close amounts)
  matched_count += await find_direct_matches({
    home_depot_transactions,
    transactions_by_key,
    matched_transactions,
    matched_transaction_keys,
    matched_receipt_ids
  })

  // TODO find multiple payment matches (receipts paid with multiple transactions)

  // Third pass: match by date exclusion (when only one transaction and receipt remain on a date)
  matched_count += await find_date_exclusion_matches({
    transactions_by_key,
    matched_transactions,
    matched_transaction_keys,
    matched_receipt_ids
  })

  return { matched_transactions, matched_count }
}

const should_skip_transaction = (transaction, matched_transaction_keys) => {
  return (
    matched_transaction_keys.has(transaction.link) ||
    !transaction.transaction_date
  )
}

const get_transaction_amount = (transaction) => {
  return transaction.to_link.toLowerCase().includes('home_depot')
    ? Number(transaction.from_amount)
    : Number(transaction.to_amount)
}

const find_direct_matches = async ({
  home_depot_transactions,
  transactions_by_key,
  matched_transactions,
  matched_transaction_keys,
  matched_receipt_ids
}) => {
  let count = 0

  for (const transaction of home_depot_transactions) {
    // Skip already matched transactions or those without dates
    if (should_skip_transaction(transaction, matched_transaction_keys)) continue

    const formatted_date = format_transaction_date(transaction.transaction_date)

    // Find potential matches by date that haven't been matched yet
    const potential_matches = Object.keys(transactions_by_key).filter(
      (key) => !matched_transactions.has(key) && key.startsWith(formatted_date)
    )

    if (potential_matches.length === 0) continue

    const transaction_amount = get_transaction_amount(transaction)

    // Find best match by amount
    const best_match = find_best_match({
      potential_matches,
      transactions_by_key,
      transaction_amount
    })

    if (best_match) {
      matched_transactions.add(best_match.match_key)
      matched_transaction_keys.add(transaction.link)
      matched_receipt_ids.add(best_match.items[0]['Transaction ID'])

      // Update transaction in database with detailed information
      await update_transaction_details(transaction.link, best_match.items)
      count++

      log(
        `Matched transaction: ${best_match.match_key} to ${
          transaction.link
        } (diff: ${best_match.difference.toFixed(2)})`
      )
    }
  }

  return count
}

const find_date_exclusion_matches = async ({
  transactions_by_key,
  matched_transactions,
  matched_transaction_keys,
  matched_receipt_ids
}) => {
  let count = 0

  // Get unmatched receipts
  const unmatched_keys = Object.keys(transactions_by_key).filter(
    (key) => !matched_transactions.has(key)
  )
  if (unmatched_keys.length === 0) return count

  // Get unique dates with unmatched receipts
  const dates_with_unmatched_receipts = new Set(
    unmatched_keys.map((key) => key.split('_')[0])
  )

  for (const date of dates_with_unmatched_receipts) {
    // Get receipts for this date
    const receipts_on_date = unmatched_keys.filter((key) =>
      key.startsWith(date)
    )

    // Only proceed if exactly one receipt on this date
    if (receipts_on_date.length !== 1) continue

    const receipt_key = receipts_on_date[0]
    const items = transactions_by_key[receipt_key]
    const receipt_id = items[0]['Transaction ID']

    // Skip if already matched
    if (matched_receipt_ids.has(receipt_id)) continue

    const result = await find_single_day_match({
      date,
      receipt_key,
      items,
      receipt_id,
      matched_transaction_keys
    })

    if (result.match_found) {
      matched_transactions.add(receipt_key)
      matched_transaction_keys.add(result.transaction_link)
      matched_receipt_ids.add(receipt_id)
      count++
    }
  }

  return count
}

const find_single_day_match = async ({
  date,
  receipt_key,
  items,
  receipt_id,
  matched_transaction_keys
}) => {
  // Find unmatched transactions on this date
  const formatted_date = format_transaction_date(date)
  const unmatched_transactions_on_date = await db('transactions')
    .select('*')
    .where('to_link', 'like', '/merchant/home_depot%')
    .where('transaction_date', formatted_date)
    .whereNotIn('link', Array.from(matched_transaction_keys))

  // Only proceed if exactly one transaction on this date
  if (unmatched_transactions_on_date.length === 1) {
    const transaction = unmatched_transactions_on_date[0]

    await update_transaction_details(transaction.link, items)

    log(`Matched by date exclusion: ${receipt_key} with ${transaction.link}`)
    return { match_found: true, transaction_link: transaction.link }
  }

  return { match_found: false }
}

const find_best_match = ({
  potential_matches,
  transactions_by_key,
  transaction_amount,
  threshold = MATCH_THRESHOLD
}) => {
  const matches_with_differences = potential_matches
    .map((match_key) => {
      const items = transactions_by_key[match_key]
      const total_amount = calculate_transaction_total(items)
      // negate to match the bank format
      const adjusted_amount = -total_amount
      const difference = Math.abs(transaction_amount - adjusted_amount)

      return { match_key, items, total_amount, difference }
    })
    .sort((a, b) => a.difference - b.difference)

  // Check if best match is good enough
  const best = matches_with_differences[0]
  if (
    best &&
    (best.difference <= AMOUNT_TOLERANCE ||
      best.difference / Math.abs(transaction_amount) < threshold)
  ) {
    return best
  }

  return null
}

const create_transaction_items_data = (items) => {
  return items.map((item) => ({
    sku: item['SKU Number'],
    description: item['SKU Description'],
    quantity: Number(item.Quantity),
    unit_price: parse_price(item['Unit price']),
    extended_price: parse_price(item['Extended Retail (before discount)']),
    department: item['Department Name'],
    class: item['Class Name'],
    subclass: item['Subclass Name']
  }))
}

const job_name_to_category = async (job_name) => {
  if (!job_name) return null

  const finance_config = await get_finance_config()
  const mappings = finance_config.config.home_depot_job_mappings

  if (mappings && mappings[job_name]) {
    return `${mappings[job_name]}`
  }

  return null
}

const update_transaction_details = async (transaction_link, items) => {
  try {
    // Get current transaction data to preserve existing categories
    const current_transaction = await db('transactions')
      .where('link', transaction_link)
      .first()

    // Get category from job name
    const job_name = items[0]['Job Name']
    const property_category = await job_name_to_category(job_name)

    // Prepare categories array, preserving existing categories
    let categories = current_transaction.categories || []

    // Add new category if it doesn't already exist
    if (property_category && !categories.includes(property_category)) {
      categories = [...categories, property_category]
    }

    await db('transactions')
      .where('link', transaction_link)
      .update({
        transaction_info: {
          type: 'home_depot',
          metadata: {
            transaction_id: items[0]['Transaction ID'],
            store_number: items[0]['Store Number'],
            date: items[0].Date,
            job_name: items[0]['Job Name']
          },
          transaction_items: create_transaction_items_data(items)
        },
        categories
      })

    return true
  } catch (error) {
    log(`Error updating transaction details: ${error.message}`)
    console.error(error)
    return false
  }
}

const log_unmatched_transactions = (unmatched_keys, transactions_by_key) => {
  if (unmatched_keys.length === 0) return

  log(`Unmatched Home Depot transactions (${unmatched_keys.length}):`)

  const total_unmatched_items = unmatched_keys.reduce(
    (sum, key) => sum + transactions_by_key[key].length,
    0
  )

  log(`Total unmatched items: ${total_unmatched_items}`)

  unmatched_keys.forEach((key) => {
    const items = transactions_by_key[key]
    const total_amount = calculate_transaction_total(items)

    log(
      `  Unmatched receipt ${key}: Total: $${total_amount.toFixed(2)}, Items: ${
        items.length
      }`
    )

    // Log all items for this transaction
    items.forEach((item) => {
      log(
        `    - ${item['SKU Description']} (${item.Quantity}x ${item['Net Unit Price']})`
      )
    })
  })
}

const main = async () => {
  try {
    await run()
  } catch (err) {
    console.log(err)
  }
  process.exit()
}

if (isMain(import.meta.url)) {
  main()
}

export default run
