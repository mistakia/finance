import dayjs from 'dayjs'

export const parse_transactions = ({ data, owner }) => {
  const institution = 'groundfloor'
  const account_link = `/${owner}/${institution}/lending/default`
  const transactions = []

  for (let i = 0; i < data.length; i++) {
    const tx = data[i]
    const date = dayjs(tx.createdAt)
    const type = (tx.type || '').toLowerCase()
    const amount = parseFloat(tx.amount || 0) / 100 // cents to dollars
    const tx_id = tx.id || `gf_${date.format('YYYYMMDDHHmmss')}_${type}_${amount}_${i}`

    const transaction = {
      link: `/${owner}/${institution}/lending/default/tx/${tx_id}`,
      transaction_type: type.includes('interest') || type.includes('payment') ? 'income' : 'transfer',
      transaction_unix: date.unix(),
      transaction_date: date.format('YYYY-MM-DD'),
      tx_id,
      description: tx.description || `${type} ${amount}`,
      original_data: tx,
      source_file: 'groundfloor-api'
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

    if (tx.loanId) {
      transaction.transaction_info = {
        loan_id: tx.loanId,
        loan_name: tx.loanName || null
      }
    }

    transactions.push(transaction)
  }

  return transactions
}
