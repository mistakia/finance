import fetch from 'node-fetch'
import BigNumber from 'bignumber.js'

export const getBalance = async ({ address }) => {
  const url = `https://api.blockchair.com/bitcoin/dashboards/address/${address}`
  const res = await fetch(url)
  const data = await res.json()
  const info = data.data[address]
  return info
}

export const convertSatsToBtc = (input) =>
  BigNumber(input).shiftedBy(-8).toFixed(8, 1)
