import dayjs from 'dayjs'

const get_transaction_type = (activity) => {
  const action = (activity.action || activity.Action || '').toLowerCase()
  if (action.includes('dividend')) return 'income'
  if (action.includes('transfer')) return 'transfer'
  if (action.includes('fee')) return 'fee'
  return 'exchange'
}

export const parse_transactions = ({ items, owner }) => {
  const institution = 'fidelity'
  const transactions = []
  const link_counts = {}

  for (const activity of items) {
    const account_number =
      activity.account_number || activity['Account Number'] || 'default'
    const account_link = `/${owner}/${institution}/brokerage/${account_number}`

    const symbol =
      activity.symbol || activity.Symbol || activity.security || 'USD'
    const quantity = parseFloat(
      activity.quantity || activity.Quantity || activity.shares || 0
    )
    const price = parseFloat(
      activity.price || activity.Price || activity.trade_price || 0
    )
    const amount = parseFloat(
      activity.amount != null ? activity.amount : (activity.Amount != null ? activity.Amount : quantity * price)
    )
    const action = (activity.action || activity.Action || '').toLowerCase()
    const date = dayjs(
      activity.date || activity.Date || activity['Settlement Date']
    )

    const action_key = action.replace(/\s+/g, '_').substring(0, 30)
    let base_id = `${institution}_${account_number}_${date.format('YYYYMMDD')}_${symbol}_${action_key}_${amount}`

    // Ensure uniqueness by appending sequence number if needed
    link_counts[base_id] = (link_counts[base_id] || 0) + 1
    const transaction_id = link_counts[base_id] > 1
      ? `${base_id}_${link_counts[base_id]}`
      : base_id

    const transaction = {
      link: `/${owner}/${institution}/${transaction_id}`,
      transaction_type: get_transaction_type(activity),
      transaction_unix: date.unix(),
      transaction_date: date.format('YYYY-MM-DD'),
      tx_id: activity.transaction_id || transaction_id,
      description: `${action.toUpperCase()} ${symbol} ${quantity ? `x${quantity}` : ''} ${price ? `@ ${price}` : ''}`.trim(),
      original_data: activity,
      source_file: 'fidelity-api'
    }

    if (action.includes('buy') || action.includes('purchased')) {
      transaction.from_link = account_link
      transaction.from_amount = -Math.abs(amount)
      transaction.from_symbol = 'USD'
      transaction.to_link = `${account_link}/${symbol}`
      transaction.to_amount = Math.abs(quantity)
      transaction.to_symbol = symbol
    } else if (action.includes('sell') || action.includes('sold')) {
      transaction.from_link = `${account_link}/${symbol}`
      transaction.from_amount = -Math.abs(quantity)
      transaction.from_symbol = symbol
      transaction.to_link = account_link
      transaction.to_amount = Math.abs(amount)
      transaction.to_symbol = 'USD'
    } else if (action.includes('dividend')) {
      transaction.from_link = `/income/dividend/${symbol}`
      transaction.from_amount = -Math.abs(amount)
      transaction.from_symbol = 'USD'
      transaction.to_link = account_link
      transaction.to_amount = Math.abs(amount)
      transaction.to_symbol = 'USD'
    } else if (action.includes('transfer')) {
      transaction.from_link = `/${owner}/external/transfer`
      transaction.from_amount = -Math.abs(amount)
      transaction.from_symbol = symbol
      transaction.to_link = account_link
      transaction.to_amount = Math.abs(amount)
      transaction.to_symbol = symbol
    } else {
      transaction.from_link = account_link
      transaction.from_amount = amount < 0 ? amount : -Math.abs(amount)
      transaction.from_symbol = 'USD'
      transaction.to_link = `${account_link}/${symbol}`
      transaction.to_amount = Math.abs(amount)
      transaction.to_symbol = symbol
    }

    transactions.push(transaction)
  }

  return transactions
}
