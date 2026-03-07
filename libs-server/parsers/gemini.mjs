import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'

dayjs.extend(utc)

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

    transaction.fee_amount = fee > 0 ? fee : null
    transaction.fee_symbol = fee > 0 ? fee_currency : null
    transaction.fee_link = fee > 0 ? account_link : null

    transactions.push(transaction)
  }

  return transactions
}

export const parse_transfers = ({ data, owner }) => {
  const institution = 'gemini'
  const account_link = `/${owner}/${institution}/exchange/default`
  const transactions = []

  for (const transfer of data) {
    const eid = String(transfer.eid)
    const date = dayjs(transfer.timestampms)
    const type = (transfer.type || '').toLowerCase()
    const currency = (transfer.currency || '').toUpperCase()
    const amount = parseFloat(transfer.amount)

    if (type === 'reward') continue

    const transaction_type = 'transfer'
    const is_deposit = type === 'deposit' || amount > 0
    const abs_amount = Math.abs(amount)

    const transaction = {
      link: `${account_link}/tx/${eid}`,
      transaction_type,
      transaction_unix: date.unix(),
      transaction_date: date.format('YYYY-MM-DD'),
      tx_id: eid,
      description: `${is_deposit ? 'Deposit' : 'Withdrawal'} ${abs_amount} ${currency}`,
      original_data: transfer,
      source_file: 'gemini-api'
    }

    if (is_deposit) {
      transaction.from_link = null
      transaction.from_amount = null
      transaction.from_symbol = currency
      transaction.to_link = `${account_link}/${currency}`
      transaction.to_amount = abs_amount
      transaction.to_symbol = currency
    } else {
      transaction.from_link = `${account_link}/${currency}`
      transaction.from_amount = -abs_amount
      transaction.from_symbol = currency
      transaction.to_link = null
      transaction.to_amount = abs_amount
      transaction.to_symbol = currency
    }

    const fee = transfer.feeAmount ? parseFloat(transfer.feeAmount) : 0
    transaction.fee_amount = fee > 0 ? fee : null
    transaction.fee_symbol = fee > 0 ? currency : null
    transaction.fee_link = fee > 0 ? account_link : null

    transactions.push(transaction)
  }

  return transactions
}

export const parse_staking_history = ({ data, owner }) => {
  const institution = 'gemini'
  const transactions = []

  for (const entry of data) {
    const tx_id = String(entry.transactionId)
    const type = (entry.transactionType || '').toLowerCase()
    const date = dayjs.utc(entry.dateTime)
    const currency = (entry.amountCurrency || '').toUpperCase()
    const amount = parseFloat(entry.amount)

    let transaction_type
    if (type === 'interest') {
      transaction_type = 'income'
    } else {
      transaction_type = 'transfer'
    }

    const staking_link = `/${owner}/${institution}/staking/default`

    const transaction = {
      link: `${staking_link}/tx/${tx_id}`,
      transaction_type,
      transaction_unix: date.unix(),
      transaction_date: date.format('YYYY-MM-DD'),
      tx_id,
      description:
        type === 'interest'
          ? `Staking reward ${amount} ${currency}`
          : `Staking ${type} ${Math.abs(amount)} ${currency}`,
      original_data: entry,
      source_file: 'gemini-api'
    }

    if (transaction_type === 'income') {
      transaction.from_link = null
      transaction.from_amount = null
      transaction.from_symbol = currency
      transaction.to_link = `${staking_link}/${currency}`
      transaction.to_amount = amount
      transaction.to_symbol = currency
    } else if (type === 'deposit') {
      const exchange_link = `/${owner}/${institution}/exchange/default`
      transaction.from_link = `${exchange_link}/${currency}`
      transaction.from_amount = -Math.abs(amount)
      transaction.from_symbol = currency
      transaction.to_link = `${staking_link}/${currency}`
      transaction.to_amount = Math.abs(amount)
      transaction.to_symbol = currency
    } else {
      const exchange_link = `/${owner}/${institution}/exchange/default`
      transaction.from_link = `${staking_link}/${currency}`
      transaction.from_amount = -Math.abs(amount)
      transaction.from_symbol = currency
      transaction.to_link = `${exchange_link}/${currency}`
      transaction.to_amount = Math.abs(amount)
      transaction.to_symbol = currency
    }

    transactions.push(transaction)
  }

  return transactions
}
