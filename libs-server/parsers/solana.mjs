import dayjs from 'dayjs'
import BigNumber from 'bignumber.js'

const convertLamportsToSol = (lamports) =>
  BigNumber(lamports).shiftedBy(-9).toNumber()

export const parse_transactions = ({ data, owner, address }) => {
  const institution = 'solana'
  const account_link = `/${owner}/${institution}/wallet/${address}`
  const transactions = []

  for (const tx of data) {
    const signature = tx.signature
    const date = dayjs.unix(tx.timestamp)
    const type = tx.type || 'UNKNOWN'
    const fee = tx.fee ? convertLamportsToSol(tx.fee) : 0

    if (type === 'SWAP' && tx.events?.swap) {
      const swap = tx.events.swap
      const native_in = swap.nativeInput
      const native_out = swap.nativeOutput
      const token_in = swap.tokenInputs?.[0]
      const token_out = swap.tokenOutputs?.[0]

      let from_symbol, from_amount, to_symbol, to_amount

      if (native_in && native_in.amount > 0) {
        from_symbol = 'SOL'
        from_amount = convertLamportsToSol(native_in.amount)
      } else if (token_in) {
        from_symbol = token_in.tokenAccount ? token_in.mint : token_in.mint
        from_amount = parseFloat(token_in.rawTokenAmount?.tokenAmount || token_in.tokenAmount || 0)
      }

      if (native_out && native_out.amount > 0) {
        to_symbol = 'SOL'
        to_amount = convertLamportsToSol(native_out.amount)
      } else if (token_out) {
        to_symbol = token_out.tokenAccount ? token_out.mint : token_out.mint
        to_amount = parseFloat(token_out.rawTokenAmount?.tokenAmount || token_out.tokenAmount || 0)
      }

      const transaction = {
        link: `${account_link}/tx/${signature}`,
        transaction_type: 'exchange',
        transaction_unix: date.unix(),
        transaction_date: date.format('YYYY-MM-DD'),
        tx_id: signature,
        description: `Swap ${from_amount || ''} ${from_symbol || '?'} for ${to_amount || ''} ${to_symbol || '?'}`,
        from_link: `${account_link}/${from_symbol || 'unknown'}`,
        from_amount: from_amount ? -from_amount : null,
        from_symbol: from_symbol || 'unknown',
        to_link: `${account_link}/${to_symbol || 'unknown'}`,
        to_amount: to_amount || null,
        to_symbol: to_symbol || 'unknown',
        original_data: tx,
        source_file: 'helius-api'
      }

      transaction.fee_amount = fee > 0 ? fee : null
      transaction.fee_symbol = fee > 0 ? 'SOL' : null
      transaction.fee_link = fee > 0 ? account_link : null

      transactions.push(transaction)
      continue
    }

    // Process native SOL transfers
    const native_transfers = tx.nativeTransfers || []
    for (const transfer of native_transfers) {
      const amount = convertLamportsToSol(Math.abs(transfer.amount))
      if (amount === 0) continue

      const is_sender = transfer.fromUserAccount === address
      const is_receiver = transfer.toUserAccount === address
      if (!is_sender && !is_receiver) continue

      const transaction = {
        link: `${account_link}/tx/${signature}/native/${is_sender ? transfer.toUserAccount : transfer.fromUserAccount}`,
        transaction_type: 'transfer',
        transaction_unix: date.unix(),
        transaction_date: date.format('YYYY-MM-DD'),
        tx_id: signature,
        description: `${is_sender ? 'Send' : 'Receive'} ${amount} SOL`,
        original_data: { ...transfer, signature, type },
        source_file: 'helius-api'
      }

      if (is_sender) {
        transaction.from_link = account_link
        transaction.from_amount = -amount
        transaction.from_symbol = 'SOL'
        transaction.to_link = null
        transaction.to_amount = amount
        transaction.to_symbol = 'SOL'
      } else {
        transaction.from_link = null
        transaction.from_amount = null
        transaction.from_symbol = 'SOL'
        transaction.to_link = account_link
        transaction.to_amount = amount
        transaction.to_symbol = 'SOL'
      }

      transaction.fee_amount = (fee > 0 && is_sender) ? fee : null
      transaction.fee_symbol = (fee > 0 && is_sender) ? 'SOL' : null
      transaction.fee_link = (fee > 0 && is_sender) ? account_link : null

      transactions.push(transaction)
    }

    // Process SPL token transfers
    const token_transfers = tx.tokenTransfers || []
    for (const transfer of token_transfers) {
      const amount = parseFloat(transfer.tokenAmount || 0)
      if (amount === 0) continue

      const is_sender = transfer.fromUserAccount === address
      const is_receiver = transfer.toUserAccount === address
      if (!is_sender && !is_receiver) continue

      const symbol = transfer.mint || 'UNKNOWN'

      const transaction = {
        link: `${account_link}/tx/${signature}/token/${symbol}`,
        transaction_type: 'transfer',
        transaction_unix: date.unix(),
        transaction_date: date.format('YYYY-MM-DD'),
        tx_id: signature,
        description: `${is_sender ? 'Send' : 'Receive'} ${amount} ${symbol}`,
        original_data: { ...transfer, signature, type },
        source_file: 'helius-api'
      }

      if (is_sender) {
        transaction.from_link = `${account_link}/${symbol}`
        transaction.from_amount = -amount
        transaction.from_symbol = symbol
        transaction.to_link = null
        transaction.to_amount = amount
        transaction.to_symbol = symbol
      } else {
        transaction.from_link = null
        transaction.from_amount = null
        transaction.from_symbol = symbol
        transaction.to_link = `${account_link}/${symbol}`
        transaction.to_amount = amount
        transaction.to_symbol = symbol
      }

      transaction.fee_amount = null
      transaction.fee_symbol = null
      transaction.fee_link = null

      transactions.push(transaction)
    }
  }

  return transactions
}

export const parse_staking_rewards = ({ data, owner, address }) => {
  const institution = 'solana'
  const transactions = []

  for (const reward of data) {
    const epoch = reward.epoch
    const amount = convertLamportsToSol(reward.amount || 0)
    if (amount === 0) continue

    const stakeAccount = address
    const staking_link = `/${owner}/${institution}/staking/${stakeAccount}`

    transactions.push({
      link: `/${owner}/${institution}/staking/${stakeAccount}/epoch/${epoch}`,
      transaction_type: 'income',
      transaction_unix: reward.effectiveSlot
        ? Math.floor(reward.effectiveSlot / 2.5)
        : dayjs().unix(),
      transaction_date: dayjs
        .unix(
          reward.effectiveSlot
            ? Math.floor(reward.effectiveSlot / 2.5)
            : dayjs().unix()
        )
        .format('YYYY-MM-DD'),
      tx_id: `epoch-${epoch}`,
      description: `Staking reward epoch ${epoch}: ${amount} SOL`,
      from_link: null,
      from_amount: null,
      from_symbol: 'SOL',
      to_link: staking_link,
      to_amount: amount,
      to_symbol: 'SOL',
      original_data: reward,
      source_file: 'helius-api'
    })
  }

  return transactions
}
