import fetch from 'node-fetch'
import BigNumber from 'bignumber.js'

export const getBalance = async ({ address }) => {
  const url = `https://nano.community/api/accounts/${address}`
  const res = await fetch(url)
  const data = await res.json()
  return data
}

export const convertRawToNano = (input) =>
  BigNumber(input).shiftedBy(-30).toFixed(30, 1)
