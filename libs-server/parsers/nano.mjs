import dayjs from 'dayjs'

import { nano } from '#libs-shared'

const convert_raw_to_nano = nano.convertRawToNano

export const parse_transactions = ({ data, owner, address }) => {
  const institution = 'nano'
  const account_link = `/${owner}/${institution}/wallet/${address}`
  const transactions = []

  for (const tx of data) {
    const hash = tx.hash
    const date = tx.local_timestamp
      ? dayjs.unix(parseInt(tx.local_timestamp, 10))
      : dayjs()
    const amount = convert_raw_to_nano(tx.amount)
    const is_send = tx.type === 'send'
    const counterparty = tx.account

    const transaction = {
      link: `/${owner}/${institution}/wallet/${address}/tx/${hash}`,
      transaction_type: is_send ? 'send' : 'receive',
      transaction_unix: date.unix(),
      transaction_date: date.format('YYYY-MM-DD'),
      tx_id: hash,
      description: `${is_send ? 'Send' : 'Receive'} ${amount} XNO`,
      original_data: tx,
      source_file: 'nano-rpc'
    }

    if (is_send) {
      transaction.from_link = account_link
      transaction.from_amount = -parseFloat(amount)
      transaction.from_symbol = 'XNO'
      transaction.to_link = `/${owner}/${institution}/external/${counterparty}`
      transaction.to_amount = parseFloat(amount)
      transaction.to_symbol = 'XNO'
    } else {
      transaction.from_link = `/${owner}/${institution}/external/${counterparty}`
      transaction.from_amount = -parseFloat(amount)
      transaction.from_symbol = 'XNO'
      transaction.to_link = account_link
      transaction.to_amount = parseFloat(amount)
      transaction.to_symbol = 'XNO'
    }

    transactions.push(transaction)
  }

  return transactions
}
