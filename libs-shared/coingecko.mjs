import fetch from 'node-fetch'

import { wait } from '#libs-shared'

let coins_cache = null

export const getCoins = async () => {
  if (coins_cache) {
    return coins_cache
  }

  const url = 'https://api.coingecko.com/api/v3/coins/list'
  const res = await fetch(url)
  const data = await res.json()

  if (data && data.length) {
    coins_cache = data
  }

  return coins_cache || []
}

export const getCoin = async ({ symbol }) => {
  const s = symbol.toLowerCase()
  const coins = await getCoins()
  const coin =
    s === 'btc'
      ? coins.find((c) => c.symbol === s && c.id === 'bitcoin')
      : coins.find((c) => c.symbol === s)
  if (!coin) {
    return null
  }

  await wait(4000)

  const url = `https://api.coingecko.com/api/v3/coins/${coin.id}`
  const res = await fetch(url)
  const data = await res.json()
  return data
}
