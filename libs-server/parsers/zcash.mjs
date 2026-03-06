import dayjs from 'dayjs'

import { zcash } from '#libs-shared'

const convert_zatoshi_to_zec = zcash.convertZatoshiToZec

export const parse_transactions = ({ data, owner, address }) => {
  const institution = 'zcash'
  const account_link = `/${owner}/${institution}/wallet/${address}`
  const transactions = []

  for (const tx of data) {
    const hash = tx.hash
    const date = dayjs.unix(tx.time || tx.block_time)
    const balance_change = tx.balance_change || 0
    const is_send = balance_change < 0
    const amount = convert_zatoshi_to_zec(Math.abs(balance_change))
    const fee = tx.fee ? convert_zatoshi_to_zec(tx.fee) : null

    const transaction = {
      link: `/${owner}/${institution}/wallet/${address}/tx/${hash}`,
      transaction_type: is_send ? 'send' : 'receive',
      transaction_unix: date.unix(),
      transaction_date: date.format('YYYY-MM-DD'),
      tx_id: hash,
      description: `${is_send ? 'Send' : 'Receive'} ${amount} ZEC`,
      original_data: tx,
      source_file: 'zcash-blockchair'
    }

    if (is_send) {
      transaction.from_link = account_link
      transaction.from_amount = -parseFloat(amount)
      transaction.from_symbol = 'ZEC'
      transaction.to_link = null
      transaction.to_amount = parseFloat(amount)
      transaction.to_symbol = 'ZEC'
    } else {
      transaction.from_link = null
      transaction.from_amount = null
      transaction.from_symbol = 'ZEC'
      transaction.to_link = account_link
      transaction.to_amount = parseFloat(amount)
      transaction.to_symbol = 'ZEC'
    }

    if (fee && is_send) {
      transaction.fee_amount = parseFloat(fee)
      transaction.fee_symbol = 'ZEC'
      transaction.fee_link = account_link
    }

    transactions.push(transaction)
  }

  return transactions
}
