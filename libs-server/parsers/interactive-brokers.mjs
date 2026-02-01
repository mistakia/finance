import dayjs from 'dayjs'

export const parse_transactions = ({ items, owner }) => {
  const institution = 'interactive-brokers'
  const account_link = `/${owner}/${institution}/brokerage/default`
  const transactions = []

  for (const trade of items) {
    const symbol = trade.symbol || 'UNKNOWN'
    const quantity = parseFloat(trade.quantity || 0)
    const price = parseFloat(trade.tradePrice || trade.price || 0)
    const proceeds = trade.proceeds != null ? parseFloat(trade.proceeds) : quantity * price
    const commission = parseFloat(trade.ibCommission || trade.commission || 0)
    const date = dayjs(trade.tradeDate || trade.dateTime)
    const buy_sell = (trade.buySell || trade.side || '').toUpperCase()

    const description_parts = [buy_sell, Math.abs(quantity), symbol]
    if (trade.strike) {
      description_parts.push(
        `${trade.putCall || ''} ${trade.strike} ${trade.expiry || ''}`
      )
    }
    description_parts.push(`@ ${price}`)

    const transaction_id = `${institution}_${trade.tradeID || trade.transactionID || `${date.format('YYYYMMDDHHmmss')}_${symbol}_${quantity}_${price}`}`

    const transaction = {
      link: `/${owner}/${institution}/${transaction_id}`,
      transaction_type: 'exchange',
      transaction_unix: date.unix(),
      transaction_date: date.format('YYYY-MM-DD'),
      tx_id: trade.tradeID || trade.transactionID,
      description: description_parts.filter(Boolean).join(' '),
      transaction_info: {
        asset_category: trade.assetCategory,
        strike: trade.strike,
        expiry: trade.expiry,
        put_call: trade.putCall
      },
      original_data: trade,
      source_file: 'interactive-brokers-api'
    }

    if (buy_sell === 'BUY' || buy_sell === 'BOT') {
      transaction.from_link = account_link
      transaction.from_amount = proceeds < 0 ? proceeds : -Math.abs(proceeds)
      transaction.from_symbol = 'USD'
      transaction.to_link = `${account_link}/${symbol}`
      transaction.to_amount = Math.abs(quantity)
      transaction.to_symbol = symbol
    } else {
      transaction.from_link = `${account_link}/${symbol}`
      transaction.from_amount = -Math.abs(quantity)
      transaction.from_symbol = symbol
      transaction.to_link = account_link
      transaction.to_amount = Math.abs(proceeds)
      transaction.to_symbol = 'USD'
    }

    if (commission) {
      transaction.fee_amount = Math.abs(commission)
      transaction.fee_symbol = 'USD'
      transaction.fee_link = account_link
    }

    transactions.push(transaction)
  }

  return transactions
}
