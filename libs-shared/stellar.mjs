import fetch from 'node-fetch'

export const getBalances = async ({ address }) => {
  const url = `https://horizon.stellar.org/accounts/${address}`
  const res = await fetch(url)
  const data = await res.json()

  if (data && data.balances) {
    // TODO support tokens
    return data.balances.filter((b) => b.asset_type === 'native')
  }

  return []
}
