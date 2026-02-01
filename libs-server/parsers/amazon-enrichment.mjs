import dayjs from 'dayjs'
import db from '#db'

const MATCH_THRESHOLD = 0.1
const AMOUNT_TOLERANCE = 1.0
const TRANSACTION_LOOK_BACK_DAYS = 7

const parse_price = (price_str) =>
  parseFloat((price_str || '0').replace(/[$,]/g, ''))

const format_date = (date) => {
  if (!date) return ''
  const date_str = typeof date === 'string' ? date : String(date)
  if (date_str.includes('T')) {
    return date_str.split('T')[0]
  }
  return dayjs(date_str).format('YYYY-MM-DD')
}

const calculate_order_total = (items) => {
  return items.reduce((sum, item) => {
    const unit_price = parse_price(item['Unit Price'])
    const unit_tax = parse_price(item['Unit Price Tax'])
    const quantity = Number(item.Quantity)
    return sum + (unit_price + unit_tax) * quantity
  }, 0)
}

const generate_date_range = (start_date, days_count, direction = 'forward') => {
  const dates = [format_date(start_date)]
  const date_obj = dayjs(start_date)

  for (let i = 1; i <= days_count; i++) {
    const new_date =
      direction === 'forward'
        ? date_obj.add(i, 'day')
        : date_obj.subtract(i, 'day')
    dates.push(new_date.format('YYYY-MM-DD'))
  }

  return dates
}

const group_records_by_order = (records) => {
  const orders = {}
  records.forEach((record) => {
    const order_id = record['Order ID']
    const order_date = format_date(record['Order Date'])
    const key = `${order_date}_${order_id}`
    if (!orders[key]) orders[key] = []
    orders[key].push(record)
  })
  return orders
}

const create_enrichment_items = (items) => {
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

export const match_enrichment = async ({
  order_records,
  return_records = [],
  source_file
}) => {
  const orders_by_key = group_records_by_order(order_records)

  const amazon_transactions = await db('transactions')
    .select('*')
    .where(function () {
      this.where('to_link', 'like', '/merchant/amazon%').orWhere(
        'from_link',
        'like',
        '/merchant/amazon%'
      )
    })

  let matched_count = 0
  const matched_orders = new Set()
  const matched_transaction_keys = new Set()

  for (const transaction of amazon_transactions) {
    if (
      matched_transaction_keys.has(transaction.link) ||
      !transaction.transaction_date ||
      (!transaction.from_amount && !transaction.to_amount)
    ) {
      continue
    }

    const potential_dates = generate_date_range(
      transaction.transaction_date,
      TRANSACTION_LOOK_BACK_DAYS,
      'backward'
    )

    const potential_matches = Object.keys(orders_by_key).filter((key) => {
      if (matched_orders.has(key)) return false
      const order_date = key.split('_')[0]
      return potential_dates.includes(order_date)
    })

    if (potential_matches.length === 0) continue

    const transaction_amount = Math.abs(Number(transaction.from_amount))

    const best = potential_matches
      .map((match_key) => {
        const items = orders_by_key[match_key]
        const total = calculate_order_total(items)
        const difference = Math.abs(transaction_amount - total)
        return { match_key, items, total, difference }
      })
      .sort((a, b) => a.difference - b.difference)[0]

    if (
      best &&
      (best.difference <= AMOUNT_TOLERANCE ||
        best.difference / transaction_amount < MATCH_THRESHOLD)
    ) {
      matched_orders.add(best.match_key)
      matched_transaction_keys.add(transaction.link)

      const order_id = best.items[0]['Order ID']
      const order_returns = return_records.filter(
        (r) => (r.OrderID || r.OrderId) === order_id
      )

      await db('transactions')
        .where('link', transaction.link)
        .update({
          enrichment_data: {
            type: 'amazon',
            source_file,
            metadata: {
              order_id,
              order_date: best.items[0]['Order Date'],
              website: best.items[0].Website,
              shipping_address: best.items[0]['Shipping Address'],
              payment_instrument: best.items[0]['Payment Instrument Type']
            },
            items: create_enrichment_items(best.items),
            returns: order_returns.map((r) => ({
              return_date: r.DateOfReturn || r.CreationDate,
              return_amount: parse_price(r.ReturnAmount),
              return_reason: r.ReturnReason,
              resolution: r.Resolution || r.ReversalStatus
            }))
          }
        })

      matched_count++
    }
  }

  return {
    matched_count,
    total_orders: Object.keys(orders_by_key).length
  }
}
