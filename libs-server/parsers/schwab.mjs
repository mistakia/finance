import dayjs from 'dayjs'

const get_transaction_type = (activity) => {
  const action = (activity.Action || activity.action || '').toLowerCase()
  if (action.includes('dividend') || action.includes('interest')) return 'income'
  if (action.includes('transfer') || action.includes('journal')) return 'transfer'
  if (action.includes('fee')) return 'fee'
  return 'exchange'
}

export const parse_transactions = ({ items, owner }) => {
  const institution = 'schwab'
  const account_link = `/${owner}/${institution}/brokerage/default`
  const transactions = []

  for (const activity of items) {
    const symbol =
      activity.Symbol || activity.symbol || activity.security || 'USD'
    const quantity = parseFloat(
      activity.Quantity || activity.quantity || activity.shares || 0
    )
    const price = parseFloat(
      activity.Price || activity.price || activity.trade_price || 0
    )
    const amount = parseFloat(
      activity.Amount || activity.amount || quantity * price || 0
    )
    const action = (activity.Action || activity.action || '').toLowerCase()
    const date = dayjs(activity.Date || activity.date)

    const transaction_id = `${institution}_${date.format('YYYYMMDD')}_${symbol}_${amount}`

    const transaction = {
      link: `/${owner}/${institution}/${transaction_id}`,
      transaction_type: get_transaction_type(activity),
      transaction_unix: date.unix(),
      transaction_date: date.format('YYYY-MM-DD'),
      tx_id: activity.transaction_id || transaction_id,
      description: `${action.toUpperCase()} ${symbol} ${quantity ? `x${quantity}` : ''} ${price ? `@ ${price}` : ''}`.trim(),
      original_data: activity,
      source_file: 'schwab-api'
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
    } else if (
      action.includes('dividend') ||
      action.includes('interest')
    ) {
      transaction.from_link = `/income/dividend/${symbol}`
      transaction.from_amount = -Math.abs(amount)
      transaction.from_symbol = 'USD'
      transaction.to_link = account_link
      transaction.to_amount = Math.abs(amount)
      transaction.to_symbol = 'USD'
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
