import dayjs from 'dayjs'

const get_type = (item) => {
  const income_labels = [
    'staking',
    'other_income',
    'airdrop',
    'mining',
    'loan_interest',
    'fork'
  ]

  switch (item.type) {
    case 'crypto_withdrawal':
      return 'purchase'

    case 'crypto_deposit':
      return income_labels.includes(item.label) ? 'income' : 'transfer'

    case 'fiat_deposit':
    case 'fiat_withdrawal':
    case 'transfer':
      return 'transfer'

    case 'exchange':
    case 'buy':
    case 'sell':
      return 'exchange'

    default:
      throw new Error(`unrecognized type: ${item.type}`)
  }
}

const get_wallet = (string) => string.replace(/\s+/g, '-').toLowerCase()

export const parse_transactions = ({ items, owner }) => {
  const transactions = []

  for (const item of items) {
    const data = {
      link: `/${owner}/koinly/${item.id}`,
      transaction_type: get_type(item),
      from_link:
        item.from &&
        `/${owner}/${get_wallet(item.from.wallet.name)}/${item.from.currency.symbol}`,
      from_amount: item.from && parseFloat(item.from.amount),
      from_symbol: item.from && item.from.currency.symbol,
      to_link:
        item.to &&
        `/${owner}/${get_wallet(item.to.wallet.name)}/${item.to.currency.symbol}`,
      to_amount: item.to && parseFloat(item.to.amount),
      to_symbol: item.to && item.to.currency.symbol,
      fee_amount: item.fee && parseFloat(item.fee.amount),
      fee_symbol: item.fee && item.fee.currency.symbol,
      fee_link:
        item.fee &&
        `/${owner}/${get_wallet(item.fee.wallet.name)}/${item.fee.currency.symbol}`,
      transaction_unix: dayjs(item.date).unix(),
      transaction_date: dayjs(item.date).format('YYYY-MM-DD'),
      tx_id: item.txhash,
      tx_src: item.txsrc,
      tx_dest: item.tx_dest,
      tx_label: item.label,
      description: item.description,
      source_file: 'koinly-api'
    }

    if (item.txdest && !data.to_link && item.from?.currency?.symbol) {
      data.to_link = `/${owner}/self/${item.from.currency.symbol}/${item.txdest}`
      data.to_symbol = item.from.currency.symbol
    }

    if (item.txsrc && !data.from_link && item.to?.currency?.symbol) {
      data.from_link = `/${owner}/self/${item.to.currency.symbol}/${item.txsrc}`
      data.from_symbol = item.to.currency.symbol
    }

    transactions.push(data)
  }

  return transactions
}
