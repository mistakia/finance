import fetch from 'node-fetch'
import BigNumber from 'bignumber.js'

import config from '#config'

export const getBalance = async ({ address }) => {
  const url = `https://api.ethplorer.io/getAddressInfo/${address}?apiKey=${config.ethplorer_api}`
  const res = await fetch(url)
  const data = await res.json()
  return data
}

export const getTransactions = async ({ address }) => {
  const url = `https://api.etherscan.io/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=asc&apikey=${config.etherscan_api || config.ethplorer_api || ''}`
  const res = await fetch(url)
  const json = await res.json()
  if (json && json.status === '1' && json.result) {
    return json.result
  }
  return []
}

export const getTokenTransactions = async ({ address }) => {
  const url = `https://api.etherscan.io/api?module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&sort=asc&apikey=${config.etherscan_api || config.ethplorer_api || ''}`
  const res = await fetch(url)
  const json = await res.json()
  if (json && json.status === '1' && json.result) {
    return json.result
  }
  return []
}

export const convert = (input, decimals) =>
  BigNumber(input).shiftedBy(-decimals).toFixed(decimals, 1)
