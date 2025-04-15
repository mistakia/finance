import fs from 'fs'
import path from 'path'
import debug from 'debug'
import dayjs from 'dayjs'
import { isMain } from '#libs-shared'
import { read_csv } from '#libs-server'
import db from '#db'

const log = debug('process_amazon_items')
debug.enable('process_amazon_items')

// CSV file constants
const FILE_PATHS = {
  ORDER_HISTORY: {
    dir: 'Retail.OrderHistory.1',
    file: 'Retail.OrderHistory.1.csv'
  },
  ORDERS_RETURNED: {
    dir: 'Retail.OrdersReturned.1',
    file: 'Retail.OrdersReturned.1.csv'
  },
  CUSTOMER_RETURNS: {
    dir: 'Retail.CustomerReturns.1.1',
    file: 'Retail.CustomerReturns.1.1.csv'
  }
}

// Matching constants
const MATCH_THRESHOLD = 0.1
const AMOUNT_TOLERANCE = 1.0
const TRANSACTION_LOOK_BACK_DAYS = 7
const RETURN_LOOK_AHEAD_DAYS = 14

// Helper functions
const parse_price = (price_str) =>
  parseFloat((price_str || '0').replace(/[$,]/g, ''))

const format_transaction_date = (date) => {
  if (!date) return ''

  // Convert to string if date is not already a string
  const date_str = typeof date === 'string' ? date : String(date)

  // Handle different date formats
  if (date_str.includes('T')) {
    // ISO format: 2024-03-21T17:38:13Z
    return date_str.split('T')[0].replace(/-/g, '')
  }
  // Other formats
  return date_str.replace(/-/g, '')
}

const calculate_transaction_total = (items) => {
  return items.reduce((sum, item) => {
    const unit_price = parse_price(item['Unit Price'])
    const unit_tax = parse_price(item['Unit Price Tax'])
    const quantity = Number(item.Quantity)
    return sum + (unit_price + unit_tax) * quantity
  }, 0)
}

const generate_date_range = (start_date, days_count, direction = 'forward') => {
  // Format the start date and add to the dates array
  const formatted_start_date = format_transaction_date(start_date)
  const dates = [formatted_start_date]

  // Create a dayjs object from the original date
  const date_obj = dayjs(start_date)

  for (let i = 1; i <= days_count; i++) {
    const new_date =
      direction === 'forward'
        ? date_obj.add(i, 'day')
        : date_obj.subtract(i, 'day')

    dates.push(new_date.format('YYYYMMDD'))
  }

  return dates
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
  // Setup file paths
  const import_data_dir = path.join(
    process.cwd(),
    'import-data',
    'amazon_order_data'
  )

  const file_paths = {
    order_history: path.join(
      import_data_dir,
      FILE_PATHS.ORDER_HISTORY.dir,
      FILE_PATHS.ORDER_HISTORY.file
    ),
    orders_returned: path.join(
      import_data_dir,
      FILE_PATHS.ORDERS_RETURNED.dir,
      FILE_PATHS.ORDERS_RETURNED.file
    ),
    customer_returns: path.join(
      import_data_dir,
      FILE_PATHS.CUSTOMER_RETURNS.dir,
      FILE_PATHS.CUSTOMER_RETURNS.file
    )
  }

  if (!fs.existsSync(file_paths.order_history)) {
    log(`Amazon Order History CSV not found at ${file_paths.order_history}`)
    return
  }

  // Read data files
  const order_history_records = await read_csv_file(file_paths.order_history)
  log(`Parsed ${order_history_records.length} Amazon order items`)

  const orders_returned_records = await read_csv_file(
    file_paths.orders_returned
  )
  if (orders_returned_records.length) {
    log(`Parsed ${orders_returned_records.length} Amazon returned orders`)
  }

  const customer_returns_records = await read_csv_file(
    file_paths.customer_returns
  )
  if (customer_returns_records.length) {
    log(`Parsed ${customer_returns_records.length} Amazon customer returns`)
  }

  // Process data
  const orders_by_key = group_records_by_order(order_history_records)
  log(`Grouped into ${Object.keys(orders_by_key).length} unique orders`)

  // Group returns by order ID
  const returns_by_order_id = group_returns_by_order_id(
    orders_returned_records,
    customer_returns_records
  )
  log(`Grouped returns for ${Object.keys(returns_by_order_id).length} orders`)

  const { matched_orders, matched_count } = await match_transactions(
    orders_by_key,
    returns_by_order_id
  )

  // Calculate unmatched orders
  const unmatched_keys = Object.keys(orders_by_key).filter(
    (key) => !matched_orders.has(key)
  )
  log(`Matched ${matched_count} Amazon orders with transactions in database`)
  log(`${unmatched_keys.length} Amazon orders were not matched`)

  // Log unmatched orders
  log_unmatched_orders(unmatched_keys, orders_by_key)
}

const group_records_by_order = (records) => {
  const orders = {}

  records.forEach((record) => {
    const order_id = record['Order ID']
    const order_date = record['Order Date']
    const key = `${format_transaction_date(order_date)}_${order_id}`

    if (!orders[key]) orders[key] = []
    orders[key].push(record)
  })

  return orders
}

const group_returns_by_order_id = (orders_returned, customer_returns) => {
  const returns = {}

  // Process orders returned
  orders_returned.forEach((record) => {
    const order_id = record.OrderID
    if (!returns[order_id]) returns[order_id] = []
    returns[order_id].push({
      ...record,
      source: 'orders_returned'
    })
  })

  // Process customer returns
  customer_returns.forEach((record) => {
    const order_id = record.OrderId
    if (!returns[order_id]) returns[order_id] = []
    returns[order_id].push({
      ...record,
      source: 'customer_returns'
    })
  })

  return returns
}

const match_transactions = async (orders_by_key, returns_by_order_id) => {
  // Find all Amazon transactions in database
  const amazon_transactions = await db('transactions')
    .select('*')
    .where('to_link', 'like', '/merchant/amazon%')

  log(`Found ${amazon_transactions.length} Amazon transactions in database`)

  // Track matches
  let matched_count = 0
  const matched_orders = new Set()
  const matched_transaction_keys = new Set()

  // First pass: find 1:1 matches (exact or close amounts)
  matched_count += await find_direct_matches({
    amazon_transactions,
    orders_by_key,
    matched_orders,
    matched_transaction_keys,
    returns_by_order_id
  })

  // Process returns as separate transactions
  matched_count += await process_returns_as_transactions({
    returns_by_order_id,
    matched_transaction_keys
  })

  return { matched_orders, matched_count }
}

const should_skip_transaction = (transaction, matched_transaction_keys) => {
  return (
    matched_transaction_keys.has(transaction.link) ||
    !transaction.transaction_date ||
    (!transaction.from_amount && transaction.to_amount)
  )
}

const find_direct_matches = async ({
  amazon_transactions,
  orders_by_key,
  matched_orders,
  matched_transaction_keys,
  returns_by_order_id
}) => {
  let count = 0

  for (const transaction of amazon_transactions) {
    // Skip already matched transactions, those without dates, or positive transactions
    if (should_skip_transaction(transaction, matched_transaction_keys)) continue

    // Get potential matching dates (looking back up to TRANSACTION_LOOK_BACK_DAYS)
    const potential_dates = generate_date_range(
      transaction.transaction_date,
      TRANSACTION_LOOK_BACK_DAYS,
      'backward'
    )

    // Find potential matches by date that haven't been matched yet
    const potential_matches = Object.keys(orders_by_key).filter((key) => {
      if (matched_orders.has(key)) return false
      const order_date = key.split('_')[0]
      return potential_dates.includes(order_date)
    })

    if (potential_matches.length === 0) continue

    const transaction_amount = Math.abs(Number(transaction.from_amount))

    // Find best match by amount
    const best_match = find_best_match({
      potential_matches,
      orders_by_key,
      transaction_amount,
      returns_by_order_id
    })

    if (best_match) {
      matched_orders.add(best_match.match_key)
      matched_transaction_keys.add(transaction.link)
      await update_transaction_details(
        transaction.link,
        best_match.items,
        returns_by_order_id
      )
      count++

      log(
        `Matched order: ${best_match.match_key} to ${
          transaction.link
        } (diff: ${best_match.difference.toFixed(2)})`
      )
    }
  }

  return count
}

const find_best_match = ({
  potential_matches,
  orders_by_key,
  transaction_amount,
  returns_by_order_id,
  threshold = MATCH_THRESHOLD
}) => {
  const matches_with_differences = potential_matches
    .map((match_key) => {
      const items = orders_by_key[match_key]
      const order_id = items[0]['Order ID']
      const total_amount = calculate_transaction_total(items)
      const returns = returns_by_order_id[order_id] || []
      const difference = Math.abs(transaction_amount - total_amount)

      return {
        match_key,
        items,
        total_amount,
        difference,
        has_returns: returns.length > 0
      }
    })
    .sort((a, b) => a.difference - b.difference)

  // Check if best match is good enough
  const best = matches_with_differences[0]
  if (
    best &&
    (best.difference <= AMOUNT_TOLERANCE ||
      best.difference / transaction_amount < threshold)
  ) {
    return best
  }

  return null
}

const create_order_items_data = (items) => {
  return items.map((item) => ({
    asin: item.ASIN,
    product_name: item['Product Name'],
    quantity: Number(item.Quantity),
    unit_price: parse_price(item['Unit Price']),
    unit_price_tax: parse_price(item['Unit Price Tax']),
    condition: item['Product Condition'],
    carrier_info: item['Carrier Name & Tracking Number']
  }))
}

const create_returns_data = (returns) => {
  return returns.map((ret) => ({
    source: ret.source,
    return_date: ret.DateOfReturn || ret.CreationDate,
    return_amount: parse_price(ret.ReturnAmount),
    return_reason: ret.ReturnReason,
    resolution: ret.Resolution || ret.ReversalStatus
  }))
}

const update_transaction_details = async (
  transaction_link,
  items,
  returns_by_order_id
) => {
  try {
    const order_id = items[0]['Order ID']
    const returns = returns_by_order_id[order_id] || []

    await db('transactions')
      .where('link', transaction_link)
      .update({
        transaction_info: {
          type: 'amazon',
          metadata: {
            order_id,
            order_date: items[0]['Order Date'],
            website: items[0].Website,
            shipping_address: items[0]['Shipping Address'],
            payment_instrument: items[0]['Payment Instrument Type']
          },
          order_items: create_order_items_data(items),
          returns: create_returns_data(returns)
        }
      })

    return true
  } catch (error) {
    log(`Error updating transaction details: ${error.message}`)
    console.error(error)
    return false
  }
}

const log_unmatched_orders = (unmatched_keys, orders_by_key) => {
  if (unmatched_keys.length === 0) return

  log(`Unmatched Amazon orders (${unmatched_keys.length}):`)

  const total_unmatched_items = unmatched_keys.reduce(
    (sum, key) => sum + orders_by_key[key].length,
    0
  )

  log(`Total unmatched items: ${total_unmatched_items}`)

  unmatched_keys.forEach((key) => {
    // Bug fix: This condition was incorrectly checking "2024" OR "2023" instead of AND
    // This means it always returned false as a string can't start with both
    if (!key.startsWith('2024') && !key.startsWith('2023')) return

    const items = orders_by_key[key]
    const total_amount = calculate_transaction_total(items)

    log(
      `  Unmatched order ${key}: Total: $${total_amount.toFixed(2)}, Items: ${
        items.length
      }`
    )

    // Log all items for this order
    items.forEach((item) => {
      log(
        `    - ${item['Product Name']} (${item.Quantity}x ${item['Unit Price']})`
      )
    })
  })
}

const is_valid_return_item = (return_item, order_id) => {
  // Skip items from orders_returned source
  if (return_item.source === 'orders_returned') return false

  // Handle 'No Refund' case or missing return date
  if (
    return_item.ReturnAmount === 'No Refund' ||
    return_item.ReturnAmount === 'Not Available' ||
    (!return_item.DateOfReturn && !return_item.CreationDate)
  ) {
    log(`Skipping return for order ${order_id} with invalid data`)
    return false
  }

  return true
}

// Process returns as separate transactions
const process_returns_as_transactions = async ({
  returns_by_order_id,
  matched_transaction_keys
}) => {
  let count = 0

  // Find all positive Amazon transactions (potential returns)
  const positive_transactions = await db('transactions')
    .select('*')
    .where('from_link', 'like', '/merchant/amazon%')
    .where('to_amount', '>', 0)
    .whereNotIn('link', Array.from(matched_transaction_keys))

  log(
    `Found ${positive_transactions.length} potential Amazon return transactions`
  )

  // Process each return
  for (const order_id in returns_by_order_id) {
    const returns = returns_by_order_id[order_id]

    for (const return_item of returns) {
      if (!is_valid_return_item(return_item, order_id)) continue

      const return_amount = Math.abs(parse_price(return_item.ReturnAmount))
      const return_date = return_item.DateOfReturn || return_item.CreationDate

      // Generate future dates for matching (return date and up to RETURN_LOOK_AHEAD_DAYS after)
      const potential_return_dates = generate_date_range(
        return_date,
        RETURN_LOOK_AHEAD_DAYS,
        'forward'
      )

      // Find matching return transaction
      const match_result = await find_matching_return_transaction({
        order_id,
        return_item,
        return_amount,
        return_date,
        potential_return_dates,
        positive_transactions,
        matched_transaction_keys
      })

      if (match_result.found) {
        matched_transaction_keys.add(match_result.transaction_link)
        count++
      }
    }
  }

  return count
}

const find_matching_return_transaction = async ({
  order_id,
  return_item,
  return_amount,
  return_date,
  potential_return_dates,
  positive_transactions,
  matched_transaction_keys
}) => {
  for (const transaction of positive_transactions) {
    // Skip already matched transactions
    if (matched_transaction_keys.has(transaction.link)) continue

    // Check if amount matches within tolerance
    if (
      Math.abs(Number(transaction.to_amount) - return_amount) <=
        AMOUNT_TOLERANCE &&
      transaction.transaction_date
    ) {
      const formatted_transaction_date = dayjs(
        transaction.transaction_date
      ).format('YYYYMMDD')

      if (potential_return_dates.includes(formatted_transaction_date)) {
        // Update transaction with return info
        await db('transactions')
          .where('link', transaction.link)
          .update({
            transaction_info: {
              type: 'amazon_return',
              metadata: {
                order_id,
                return_date,
                return_reason: return_item.ReturnReason,
                resolution: return_item.Resolution || return_item.ReversalStatus
              }
            }
          })

        log(
          `Matched return for order ${order_id} to transaction ${transaction.link}`
        )
        return { found: true, transaction_link: transaction.link }
      }
    }
  }

  log(
    `Could not find matching transaction for return of order ${order_id} ($${return_amount.toFixed(
      2
    )}) (${return_date})`
  )
  return { found: false }
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
