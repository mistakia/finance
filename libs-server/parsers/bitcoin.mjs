import dayjs from 'dayjs'
import BigNumber from 'bignumber.js'

import { bitcoin } from '#libs-shared'

const convert_sats_to_btc = bitcoin.convertSatsToBtc

export const parse_transactions = ({ data, owner, address }) => {
  const institution = 'bitcoin'
  const account_link = `/${owner}/${institution}/wallet/${address}`
  const transactions = []

  for (const tx of data) {
    const hash = tx.hash
    const date = dayjs.unix(tx.time)

    const input_total = tx.inputs.reduce((sum, inp) => {
      if (inp.prev_out && inp.prev_out.addr === address) {
        return sum.plus(inp.prev_out.value)
      }
      return sum
    }, BigNumber(0))

    const output_total = tx.out.reduce((sum, out) => {
      if (out.addr === address) {
        return sum.plus(out.value)
      }
      return sum
    }, BigNumber(0))

    const net = output_total.minus(input_total)
    const is_send = net.isNegative()
    const amount = convert_sats_to_btc(net.abs())
    const fee = tx.fee ? convert_sats_to_btc(tx.fee) : null

    const transaction = {
      link: `/${owner}/${institution}/wallet/${address}/tx/${hash}`,
      transaction_type: is_send ? 'send' : 'receive',
      transaction_unix: date.unix(),
      transaction_date: date.format('YYYY-MM-DD'),
      tx_id: hash,
      description: `${is_send ? 'Send' : 'Receive'} ${amount} BTC`,
      original_data: tx,
      source_file: 'bitcoin-blockchain-info'
    }

    if (is_send) {
      transaction.from_link = account_link
      transaction.from_amount = -parseFloat(amount)
      transaction.from_symbol = 'BTC'
      transaction.to_link = null
      transaction.to_amount = parseFloat(amount)
      transaction.to_symbol = 'BTC'
    } else {
      transaction.from_link = null
      transaction.from_amount = null
      transaction.from_symbol = 'BTC'
      transaction.to_link = account_link
      transaction.to_amount = parseFloat(amount)
      transaction.to_symbol = 'BTC'
    }

    if (fee && is_send) {
      transaction.fee_amount = parseFloat(fee)
      transaction.fee_symbol = 'BTC'
      transaction.fee_link = account_link
    }

    transactions.push(transaction)
  }

  return transactions
}
