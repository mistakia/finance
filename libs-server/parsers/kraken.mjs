import dayjs from 'dayjs'

import { normalizeAssetSymbol } from '../../libs-shared/kraken.mjs'

const KRAKEN_QUOTE_SYMBOLS = ['ZUSD', 'ZEUR', 'ZCAD', 'ZGBP', 'ZJPY', 'XXBT', 'XETH', 'USD', 'EUR', 'CAD', 'GBP', 'JPY', 'BTC', 'ETH']

const parse_pair = (pair) => {
  if (!pair) return { base: null, quote: null }
  // Kraken pairs use / separator or concatenated symbols
  if (pair.includes('/')) {
    const [base, quote] = pair.split('/')
    return {
      base: normalizeAssetSymbol(base),
      quote: normalizeAssetSymbol(quote)
    }
  }
  // Try known Kraken quote suffixes (longest first to match ZUSD before USD)
  const sorted = [...KRAKEN_QUOTE_SYMBOLS].sort((a, b) => b.length - a.length)
  for (const quote of sorted) {
    if (pair.endsWith(quote) && pair.length > quote.length) {
      return {
        base: normalizeAssetSymbol(pair.slice(0, -quote.length)),
        quote: normalizeAssetSymbol(quote)
      }
    }
  }
  return { base: pair, quote: 'USD' }
}

const ledger_type_to_transaction_type = (type) => {
  switch ((type || '').toLowerCase()) {
    case 'trade':
      return 'exchange'
    case 'deposit':
    case 'withdrawal':
    case 'transfer':
      return 'transfer'
    case 'staking':
    case 'dividend':
      return 'staking_income'
    default:
      return 'transfer'
  }
}

export const parse_ledger_entries = ({ data, owner }) => {
  const institution = 'kraken'
  const account_link = `/${owner}/${institution}/exchange/default`
  const transactions = []

  const entries = Object.entries(data)

  for (const [ledger_id, entry] of entries) {
    const date = dayjs.unix(entry.time)
    const type = (entry.type || '').toLowerCase()
    const symbol = normalizeAssetSymbol(entry.asset)
    const amount = parseFloat(entry.amount)
    const fee = parseFloat(entry.fee || 0)
    const transaction_type = ledger_type_to_transaction_type(type)

    const abs_amount = Math.abs(amount)
    const is_inflow = amount > 0

    const transaction = {
      link: `${account_link}/tx/${ledger_id}`,
      transaction_type,
      transaction_unix: date.unix(),
      transaction_date: date.format('YYYY-MM-DD'),
      tx_id: entry.refid || ledger_id,
      description: `${type} ${abs_amount} ${symbol}`,
      original_data: { ledger_id, ...entry },
      source_file: 'kraken-api'
    }

    if (transaction_type === 'staking_income') {
      transaction.from_link = null
      transaction.from_amount = null
      transaction.from_symbol = symbol
      transaction.to_link = `${account_link}/${symbol}`
      transaction.to_amount = abs_amount
      transaction.to_symbol = symbol
    } else if (is_inflow) {
      transaction.from_link = type === 'deposit' ? null : account_link
      transaction.from_amount = type === 'deposit' ? null : null
      transaction.from_symbol = symbol
      transaction.to_link = `${account_link}/${symbol}`
      transaction.to_amount = abs_amount
      transaction.to_symbol = symbol
    } else {
      transaction.from_link = `${account_link}/${symbol}`
      transaction.from_amount = -abs_amount
      transaction.from_symbol = symbol
      transaction.to_link = type === 'withdrawal' ? null : account_link
      transaction.to_amount = abs_amount
      transaction.to_symbol = symbol
    }

    if (fee > 0) {
      transaction.fee_amount = fee
      transaction.fee_symbol = symbol
      transaction.fee_link = account_link
    }

    transactions.push(transaction)
  }

  return transactions
}

export const parse_trades = ({ data, owner }) => {
  const institution = 'kraken'
  const account_link = `/${owner}/${institution}/exchange/default`
  const transactions = []

  const entries = Object.entries(data)

  for (const [trade_id, trade] of entries) {
    const date = dayjs.unix(trade.time)
    const type = (trade.type || '').toLowerCase()
    const { base, quote } = parse_pair(trade.pair)
    const price = parseFloat(trade.price)
    const vol = parseFloat(trade.vol)
    const cost = parseFloat(trade.cost)
    const fee = parseFloat(trade.fee || 0)

    const transaction = {
      link: `${account_link}/trade/${trade_id}`,
      transaction_type: 'exchange',
      transaction_unix: date.unix(),
      transaction_date: date.format('YYYY-MM-DD'),
      tx_id: trade.ordertxid || trade_id,
      description: `${type.toUpperCase()} ${vol} ${base} @ ${price} ${quote}`,
      original_data: { trade_id, ...trade },
      source_file: 'kraken-api'
    }

    if (type === 'buy') {
      transaction.from_link = account_link
      transaction.from_amount = -cost
      transaction.from_symbol = quote
      transaction.to_link = `${account_link}/${base}`
      transaction.to_amount = vol
      transaction.to_symbol = base
    } else {
      transaction.from_link = `${account_link}/${base}`
      transaction.from_amount = -vol
      transaction.from_symbol = base
      transaction.to_link = account_link
      transaction.to_amount = cost
      transaction.to_symbol = quote
    }

    if (fee > 0) {
      transaction.fee_amount = fee
      transaction.fee_symbol = quote
      transaction.fee_link = account_link
    }

    transactions.push(transaction)
  }

  return transactions
}
