import dayjs from 'dayjs'

export const create_balance_assertions = ({
  positions,
  institution,
  owner,
  timestamp = new Date().toISOString()
}) => {
  const date = dayjs(timestamp)
  const transactions = []

  for (const position of positions) {
    const symbol = position.symbol || 'USD'
    const quantity = parseFloat(position.quantity || position.balance || 0)
    const account_id = position.account_id || position.address || 'default'
    const account_type = position.account_type || 'brokerage'
    const account_link = `/${owner}/${institution}/${account_type}/${account_id}`

    const assertion_id = `${institution}_assertion_${date.format('YYYYMMDDHHmmss')}_${symbol}_${account_id}`

    transactions.push({
      link: `/${owner}/${institution}/assertion/${assertion_id}`,
      transaction_type: 'balance_assertion',
      from_link: null,
      from_amount: null,
      from_symbol: null,
      to_link: account_link,
      to_amount: quantity,
      to_symbol: symbol,
      transaction_unix: date.unix(),
      transaction_date: date.format('YYYY-MM-DD'),
      tx_id: assertion_id,
      description: `Balance assertion: ${quantity} ${symbol} at ${institution}`,
      transaction_info: {
        assertion_type: 'position_snapshot',
        institution,
        account_link,
        cost_basis: position.cost_basis || null,
        market_value: position.market_value || position.value || null,
        name: position.name || null
      },
      original_data: position,
      source_file: `${institution}-api`
    })
  }

  return transactions
}
