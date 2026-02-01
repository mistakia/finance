import dayjs from 'dayjs'

export const parse_transactions = ({ items, owner }) => {
  const institution = 'robinhood'
  const account_link = `/${owner}/${institution}/brokerage/default`
  const transactions = []

  for (const order of items) {
    if (order.state !== 'filled') continue

    const symbol = order.symbol || order.instrument_symbol || 'UNKNOWN'
    const side = order.side || 'buy'
    const quantity = parseFloat(order.cumulative_quantity || order.quantity || 0)
    const price = parseFloat(order.average_price || order.price || 0)
    const total = quantity * price
    const date = dayjs(order.last_transaction_at || order.updated_at)

    const transaction_id = `${institution}_${order.id}`

    const transaction = {
      link: `/${owner}/${institution}/${transaction_id}`,
      transaction_type: 'exchange',
      transaction_unix: date.unix(),
      transaction_date: date.format('YYYY-MM-DD'),
      tx_id: order.id,
      description: `${side.toUpperCase()} ${quantity} ${symbol} @ ${price}`,
      original_data: order,
      source_file: 'robinhood-api'
    }

    if (side === 'buy') {
      transaction.from_link = account_link
      transaction.from_amount = -total
      transaction.from_symbol = 'USD'
      transaction.to_link = `${account_link}/${symbol}`
      transaction.to_amount = quantity
      transaction.to_symbol = symbol
    } else {
      transaction.from_link = `${account_link}/${symbol}`
      transaction.from_amount = -quantity
      transaction.from_symbol = symbol
      transaction.to_link = account_link
      transaction.to_amount = total
      transaction.to_symbol = 'USD'
    }

    if (order.fees && parseFloat(order.fees) > 0) {
      transaction.fee_amount = parseFloat(order.fees)
      transaction.fee_symbol = 'USD'
      transaction.fee_link = account_link
    }

    transactions.push(transaction)
  }

  return transactions
}
