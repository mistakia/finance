import fetch from 'node-fetch'
import BigNumber from 'bignumber.js'

export const getBalance = async ({ address }) => {
  const url = `https://api.blockchair.com/zcash/dashboards/address/${address}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Blockchair API error: ${res.status} ${res.statusText}`)
  }
  const json = await res.json()
  if (json && json.data && json.data[address]) {
    return json.data[address].address.balance
  }

  return null
}

export const getTransactions = async ({ address }) => {
  const url = `https://api.blockchair.com/zcash/dashboards/address/${address}?limit=100&transaction_details=true`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Blockchair API error: ${res.status} ${res.statusText}`)
  }
  const json = await res.json()
  if (json && json.data && json.data[address]) {
    return json.data[address].transactions || []
  }

  return []
}

export const convertZatoshiToZec = (input) =>
  BigNumber(input).shiftedBy(-8).toFixed(8, 1)
