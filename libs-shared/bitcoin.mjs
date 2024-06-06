import fetch from 'node-fetch'
import BigNumber from 'bignumber.js'

export const getBalance = async ({ address }) => {
  const url = `https://blockchain.info/rawaddr/${address}`
  const res = await fetch(url)
  const json = await res.json()
  if (json && json.final_balance) {
    return json.final_balance
  }

  return null
}

export const convertSatsToBtc = (input) =>
  BigNumber(input).shiftedBy(-8).toFixed(8, 1)
