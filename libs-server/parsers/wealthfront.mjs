import dayjs from 'dayjs'

export const parse_transactions = ({ data, owner }) => {
  const institution = 'wealthfront'
  const transactions = []

  const items = data?.activities || data?.transactions || data || []
  const tx_list = Array.isArray(items) ? items : [items]

  for (const tx of tx_list) {
    const date = dayjs(tx.date || tx.createdAt || tx.timestamp)
    const type = (tx.type || tx.activityType || '').toLowerCase()
    const amount = parseFloat(tx.amount || tx.value || 0)
    const account_id = tx.accountId || tx.account_id || 'default'
    const account_type = tx.accountType || 'brokerage'
    const account_link = `/${owner}/${institution}/${account_type}/${account_id}`
    const tx_id = tx.id || tx.transactionId || `wf_${date.format('YYYYMMDDHHmmss')}_${type}_${amount}`

    const transaction = {
      link: `/${owner}/${institution}/${account_type}/${account_id}/tx/${tx_id}`,
      transaction_type: type.includes('dividend') ? 'dividend' : type.includes('transfer') ? 'transfer' : 'exchange',
      transaction_unix: date.unix(),
      transaction_date: date.format('YYYY-MM-DD'),
      tx_id,
      description: tx.description || `${type} ${amount}`,
      original_data: tx,
      source_file: 'wealthfront-api'
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
