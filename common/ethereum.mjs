import fetch from 'node-fetch'
import BigNumber from 'bignumber.js'

import config from '#config'

export const getBalance = async ({ address }) => {
  const url = `https://api.ethplorer.io/getAddressInfo/${address}?apiKey=${config.ethplorer_api}`
  const res = await fetch(url)
  const data = await res.json()
  return data
}

export const convert = (input, decimals) =>
  BigNumber(input).shiftedBy(-decimals).toFixed(decimals, 1)
