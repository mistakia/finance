import fetch from 'node-fetch'
import BigNumber from 'bignumber.js'

export const getBalance = async ({ address }) => {
  const url = `https://chain.api.btc.com/v3/address/${address}`
  const res = await fetch(url)
  const json = await res.json()
  if (json.data && json.data.balance) {
    return json.data.balance
  }

  return null
}

export const convertSatsToBtc = (input) =>
  BigNumber(input).shiftedBy(-8).toFixed(8, 1)
