import dayjs from 'dayjs'
import db from '#db'

const SALES_TAX_RATE = 1.06
const MATCH_THRESHOLD = 0.1
const AMOUNT_TOLERANCE = 1.0

const parse_price = (price_str) =>
  parseFloat((price_str || '0').replace(/[$,]/g, ''))

const format_transaction_date = (date) => {
  if (!date) return ''
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

const group_records_by_transaction = (records) => {
  const transactions = {}
  records.forEach((record) => {
    const key = `${record.Date}_${record['Transaction ID']}`
    if (!transactions[key]) transactions[key] = []
    transactions[key].push(record)
  })
  return transactions
}

const create_enrichment_items = (items) => {
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

export const match_enrichment = async ({ records, source_file }) => {
  const transactions_by_key = group_records_by_transaction(records)
  const home_depot_transactions = await db('transactions')
    .select('*')
    .where(function () {
      this.where('to_link', 'like', '/merchant/home-depot%')
        .orWhere('to_link', 'like', '/merchant/home_depot%')
        .orWhere('from_link', 'like', '/merchant/home-depot%')
        .orWhere('from_link', 'like', '/merchant/home_depot%')
    })

  let matched_count = 0
  const matched_transactions = new Set()
  const matched_transaction_keys = new Set()

  for (const transaction of home_depot_transactions) {
    if (matched_transaction_keys.has(transaction.link) || !transaction.transaction_date) continue

    const formatted_date = format_transaction_date(transaction.transaction_date)
    const potential_matches = Object.keys(transactions_by_key).filter(
      (key) => !matched_transactions.has(key) && key.startsWith(formatted_date)
    )

    if (potential_matches.length === 0) continue

    const transaction_amount = transaction.to_link.toLowerCase().includes('home')
      ? Number(transaction.from_amount)
      : Number(transaction.to_amount)

    const best = potential_matches
      .map((match_key) => {
        const items = transactions_by_key[match_key]
        const total = -calculate_transaction_total(items)
        const difference = Math.abs(transaction_amount - total)
        return { match_key, items, difference }
      })
      .sort((a, b) => a.difference - b.difference)[0]

    if (
      best &&
      (best.difference <= AMOUNT_TOLERANCE ||
        best.difference / Math.abs(transaction_amount) < MATCH_THRESHOLD)
    ) {
      matched_transactions.add(best.match_key)
      matched_transaction_keys.add(transaction.link)

      await db('transactions')
        .where('link', transaction.link)
        .update({
          enrichment_data: {
            type: 'home_depot',
            source_file,
            metadata: {
              transaction_id: best.items[0]['Transaction ID'],
              store_number: best.items[0]['Store Number'],
              date: best.items[0].Date,
              job_name: best.items[0]['Job Name']
            },
            items: create_enrichment_items(best.items)
          }
        })

      matched_count++
    }
  }

  return { matched_count, total_receipts: Object.keys(transactions_by_key).length }
}
