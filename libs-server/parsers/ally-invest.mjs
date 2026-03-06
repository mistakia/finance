import dayjs from 'dayjs'

export const parse_transactions = ({ data, owner }) => {
  const institution = 'ally-invest'
  const account_link = `/${owner}/${institution}/brokerage/default`
  const transactions = []

  const items = data?.response?.transactions?.transaction || []
  const tx_list = Array.isArray(items) ? items : [items]

  for (let i = 0; i < tx_list.length; i++) {
    const tx = tx_list[i]
    const date = dayjs(tx.date)
    const activity = tx.activity || ''
    const symbol = tx.transaction?.security?.sym || 'USD'
    const quantity = parseFloat(tx.transaction?.quantity || 0)
    const amount = parseFloat(tx.amount || 0)
    const tx_id = `ally_invest_${tx.date}_${activity}_${symbol}_${amount}_${i}`

    const transaction = {
      link: `/${owner}/${institution}/brokerage/default/tx/${tx_id}`,
      transaction_type: activity.toLowerCase().includes('trade') ? 'exchange' : 'transfer',
      transaction_unix: date.unix(),
      transaction_date: date.format('YYYY-MM-DD'),
      tx_id,
      description: `${activity} ${quantity ? quantity + ' ' : ''}${symbol} ${amount}`,
      original_data: tx,
      source_file: 'ally-invest-api'
    }

    if (amount >= 0) {
      transaction.from_link = null
      transaction.from_amount = null
      transaction.from_symbol = null
      transaction.to_link = account_link
      transaction.to_amount = amount
      transaction.to_symbol = 'USD'
    } else {
      transaction.from_link = account_link
      transaction.from_amount = amount
      transaction.from_symbol = 'USD'
      transaction.to_link = null
      transaction.to_amount = Math.abs(amount)
      transaction.to_symbol = 'USD'
    }

    transactions.push(transaction)
  }

  return transactions
}
