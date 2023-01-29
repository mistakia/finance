import fetch from 'node-fetch'
import BigNumber from 'bignumber.js'

export const getAccount = async ({ address }) => {
  const url = `https://api.bitaps.com/ltc/v1/blockchain/address/state/${address}`
  const res = await fetch(url)
  return res.json()
}

export const convertLitoshiToLTC = (input) =>
  BigNumber(input).shiftedBy(-8).toFixed(8, 1)
