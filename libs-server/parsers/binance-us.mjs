import dayjs from 'dayjs'

const KNOWN_QUOTES = ['USDT', 'BUSD', 'USD', 'BTC', 'ETH', 'BNB']

const parse_symbol_pair = (symbol) => {
  if (!symbol) return { base: symbol, quote: 'USD' }
  for (const quote of KNOWN_QUOTES) {
    if (symbol.endsWith(quote) && symbol.length > quote.length) {
      return { base: symbol.slice(0, -quote.length), quote }
    }
  }
  return { base: symbol, quote: 'USD' }
}

export const parse_trades = ({ data, owner }) => {
  const institution = 'binance-us'
  const account_link = `/${owner}/${institution}/exchange/default`
  const transactions = []

  for (const trade of data) {
    const id = String(trade.id)
    const date = dayjs(trade.time)
    const { base, quote } = parse_symbol_pair(trade.symbol)
    const qty = parseFloat(trade.qty)
    const quote_qty = parseFloat(trade.quoteQty)
    const commission = parseFloat(trade.commission || 0)
    const commission_asset = trade.commissionAsset || quote
    const is_buyer = trade.isBuyer

    const transaction = {
      link: `${account_link}/tx/${id}`,
      transaction_type: 'exchange',
      transaction_unix: date.unix(),
      transaction_date: date.format('YYYY-MM-DD'),
      tx_id: id,
      description: `${is_buyer ? 'BUY' : 'SELL'} ${qty} ${base} @ ${quote_qty / qty} ${quote}`,
      original_data: trade,
      source_file: 'binance-us-api'
    }

    if (is_buyer) {
      transaction.from_link = account_link
      transaction.from_amount = -quote_qty
      transaction.from_symbol = quote
      transaction.to_link = `${account_link}/${base}`
      transaction.to_amount = qty
      transaction.to_symbol = base
    } else {
      transaction.from_link = `${account_link}/${base}`
      transaction.from_amount = -qty
      transaction.from_symbol = base
      transaction.to_link = account_link
      transaction.to_amount = quote_qty
      transaction.to_symbol = quote
    }

    if (commission > 0) {
      transaction.fee_amount = commission
      transaction.fee_symbol = commission_asset
      transaction.fee_link = account_link
    }

    transactions.push(transaction)
  }

  return transactions
}

export const parse_deposits = ({ data, owner }) => {
  const institution = 'binance-us'
  const account_link = `/${owner}/${institution}/exchange/default`
  const transactions = []

  for (const deposit of data) {
    const tx_id = deposit.txId || String(deposit.id)
    const date = dayjs(deposit.insertTime)
    const coin = deposit.coin
    const amount = parseFloat(deposit.amount)

    transactions.push({
      link: `${account_link}/tx/dep-${tx_id}`,
      transaction_type: 'transfer',
      transaction_unix: date.unix(),
      transaction_date: date.format('YYYY-MM-DD'),
      tx_id,
      description: `Deposit ${amount} ${coin}`,
      from_link: null,
      from_amount: null,
      from_symbol: coin,
      to_link: `${account_link}/${coin}`,
      to_amount: amount,
      to_symbol: coin,
      original_data: deposit,
      source_file: 'binance-us-api'
    })
  }

  return transactions
}

export const parse_withdrawals = ({ data, owner }) => {
  const institution = 'binance-us'
  const account_link = `/${owner}/${institution}/exchange/default`
  const transactions = []

  for (const withdrawal of data) {
    const tx_id = withdrawal.txId || withdrawal.id
    const date = dayjs(withdrawal.applyTime)
    const coin = withdrawal.coin
    const amount = parseFloat(withdrawal.amount)
    const fee = parseFloat(withdrawal.transactionFee || 0)

    const transaction = {
      link: `${account_link}/tx/wth-${tx_id}`,
      transaction_type: 'transfer',
      transaction_unix: date.unix(),
      transaction_date: date.format('YYYY-MM-DD'),
      tx_id,
      description: `Withdrawal ${amount} ${coin}`,
      from_link: `${account_link}/${coin}`,
      from_amount: -amount,
      from_symbol: coin,
      to_link: null,
      to_amount: amount,
      to_symbol: coin,
      original_data: withdrawal,
      source_file: 'binance-us-api'
    }

    if (fee > 0) {
      transaction.fee_amount = fee
      transaction.fee_symbol = coin
      transaction.fee_link = account_link
    }

    transactions.push(transaction)
  }

  return transactions
}

export const parse_staking_rewards = ({ data, owner }) => {
  const institution = 'binance-us'
  const account_link = `/${owner}/${institution}/exchange/default`
  const transactions = []

  for (const reward of data) {
    const date = dayjs(reward.time || reward.updateTime)
    const coin = reward.asset || reward.coin
    const amount = parseFloat(reward.amount)
    const tx_id = reward.id
      ? String(reward.id)
      : `stk-${coin}-${date.unix()}`

    transactions.push({
      link: `${account_link}/tx/${tx_id}`,
      transaction_type: 'staking_income',
      transaction_unix: date.unix(),
      transaction_date: date.format('YYYY-MM-DD'),
      tx_id,
      description: `Staking reward ${amount} ${coin}`,
      from_link: null,
      from_amount: null,
      from_symbol: coin,
      to_link: `${account_link}/${coin}`,
      to_amount: amount,
      to_symbol: coin,
      original_data: reward,
      source_file: 'binance-us-api'
    })
  }

  return transactions
}
