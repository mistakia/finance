import fetch from 'node-fetch'

let coins_cache = null

export const getCoins = async () => {
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
  const coin = coins.find((c) => c.symbol === s)
  if (!coin) {
    return null
  }

  const url = `https://api.coingecko.com/api/v3/coins/${coin.id}`
  const res = await fetch(url)
  const data = await res.json()
  return data
}
