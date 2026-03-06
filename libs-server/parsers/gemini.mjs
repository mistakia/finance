import dayjs from 'dayjs'

const KNOWN_QUOTES = ['usd', 'btc', 'eth']

const parse_symbol_pair = (pair) => {
  const lower = (pair || '').toLowerCase()
  for (const quote of KNOWN_QUOTES) {
    if (lower.endsWith(quote)) {
      const base = lower.slice(0, -quote.length)
      if (base.length > 0) {
        return { base: base.toUpperCase(), quote: quote.toUpperCase() }
      }
    }
  }
  return { base: lower.toUpperCase(), quote: 'USD' }
}

export const parse_transactions = ({ data, owner }) => {
  const institution = 'gemini'
  const account_link = `/${owner}/${institution}/exchange/default`
  const transactions = []

  for (const trade of data) {
    const tid = String(trade.tid)
    const date = dayjs(trade.timestamp)
    const type = (trade.type || '').toLowerCase()
    const amount = parseFloat(trade.amount)
    const price = parseFloat(trade.price)
    const total = amount * price
    const fee = parseFloat(trade.fee_amount || 0)
    const fee_currency = trade.fee_currency || 'USD'

    const { base, quote } = parse_symbol_pair(trade.symbol)

    const transaction = {
      link: `/${owner}/${institution}/exchange/default/tx/${tid}`,
      transaction_type: 'exchange',
      transaction_unix: date.unix(),
      transaction_date: date.format('YYYY-MM-DD'),
      tx_id: tid,
      description: `${type === 'buy' ? 'BUY' : 'SELL'} ${amount} ${base} @ ${price} ${quote}`,
      original_data: trade,
      source_file: 'gemini-api'
    }

    if (type === 'buy') {
      transaction.from_link = account_link
      transaction.from_amount = -total
      transaction.from_symbol = quote
      transaction.to_link = `${account_link}/${base}`
      transaction.to_amount = amount
      transaction.to_symbol = base
    } else {
      transaction.from_link = `${account_link}/${base}`
      transaction.from_amount = -amount
      transaction.from_symbol = base
      transaction.to_link = account_link
      transaction.to_amount = total
      transaction.to_symbol = quote
    }

    if (fee > 0) {
      transaction.fee_amount = fee
      transaction.fee_symbol = fee_currency
      transaction.fee_link = account_link
    }

    transactions.push(transaction)
  }

  return transactions
}
