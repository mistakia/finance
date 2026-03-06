import dayjs from 'dayjs'
import BigNumber from 'bignumber.js'

import { ethereum } from '#libs-shared'

const convert_token = ethereum.convert

const convert_wei_to_eth = (input) => convert_token(input, 18)

const build_transaction = ({ tx, owner, address, tx_id, amount, symbol, source_file, fee_info }) => {
  const institution = 'ethereum'
  const account_link = `/${owner}/${institution}/wallet/${address}`
  const is_send = tx.from.toLowerCase() === address.toLowerCase()
  const date = dayjs.unix(parseInt(tx.timeStamp, 10))

  const transaction = {
    link: `/${owner}/${institution}/wallet/${address}/tx/${tx_id}`,
    transaction_type: is_send ? 'send' : 'receive',
    transaction_unix: date.unix(),
    transaction_date: date.format('YYYY-MM-DD'),
    tx_id,
    description: `${is_send ? 'Send' : 'Receive'} ${amount} ${symbol}`,
    original_data: tx,
    source_file
  }

  if (is_send) {
    transaction.from_link = account_link
    transaction.from_amount = -parseFloat(amount)
    transaction.from_symbol = symbol
    transaction.to_link = `/${owner}/${institution}/external/${tx.to}`
    transaction.to_amount = parseFloat(amount)
    transaction.to_symbol = symbol
  } else {
    transaction.from_link = `/${owner}/${institution}/external/${tx.from}`
    transaction.from_amount = -parseFloat(amount)
    transaction.from_symbol = symbol
    transaction.to_link = account_link
    transaction.to_amount = parseFloat(amount)
    transaction.to_symbol = symbol
  }

  if (fee_info && is_send && parseFloat(fee_info.amount) > 0) {
    transaction.fee_amount = parseFloat(fee_info.amount)
    transaction.fee_symbol = fee_info.symbol
    transaction.fee_link = account_link
  }

  return transaction
}

export const parse_transactions = ({ data, owner, address }) => {
  return data.map((tx) => {
    const amount = tx.tokenDecimal
      ? convert_token(tx.value, parseInt(tx.tokenDecimal, 10))
      : convert_wei_to_eth(tx.value)
    const symbol = tx.tokenSymbol || 'ETH'
    const gas_cost = BigNumber(tx.gasUsed).times(tx.gasPrice)
    const fee = convert_wei_to_eth(gas_cost)

    return build_transaction({
      tx, owner, address,
      tx_id: tx.hash,
      amount, symbol,
      source_file: 'ethereum-etherscan',
      fee_info: { amount: fee, symbol: 'ETH' }
    })
  })
}

export const parse_token_transactions = ({ data, owner, address }) => {
  return data.map((tx) => {
    const decimals = parseInt(tx.tokenDecimal, 10)
    const amount = convert_token(tx.value, decimals)
    const symbol = tx.tokenSymbol || 'UNKNOWN'
    const tx_id = `${tx.hash}_${tx.tokenSymbol}_${tx.logIndex || 0}`

    return build_transaction({
      tx, owner, address,
      tx_id, amount, symbol,
      source_file: 'ethereum-etherscan-tokentx'
    })
  })
}

export const parse_internal_transactions = ({ data, owner, address }) => {
  return data.map((tx) => {
    const amount = convert_wei_to_eth(tx.value)
    const tx_id = `${tx.hash}_internal_${tx.traceId || 0}`

    return build_transaction({
      tx, owner, address,
      tx_id, amount, symbol: 'ETH',
      source_file: 'ethereum-etherscan-txlistinternal'
    })
  })
}

export const parse_beacon_withdrawals = ({ data, owner, address }) => {
  return data.map((tx) => {
    const amount = convert_wei_to_eth(tx.amount)
    const date = dayjs.unix(parseInt(tx.timestamp, 10))
    const tx_id = `beacon_${tx.withdrawalIndex}`
    const institution = 'ethereum'
    const account_link = `/${owner}/${institution}/wallet/${address}`

    return {
      link: `/${owner}/${institution}/wallet/${address}/tx/${tx_id}`,
      transaction_type: 'staking_income',
      transaction_unix: date.unix(),
      transaction_date: date.format('YYYY-MM-DD'),
      tx_id,
      description: `Beacon chain withdrawal ${amount} ETH`,
      original_data: tx,
      source_file: 'ethereum-etherscan-beacon',
      from_link: `/${owner}/${institution}/beacon/validator/${tx.validatorIndex}`,
      from_amount: -parseFloat(amount),
      from_symbol: 'ETH',
      to_link: account_link,
      to_amount: parseFloat(amount),
      to_symbol: 'ETH'
    }
  })
}
