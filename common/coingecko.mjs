import fetch from 'node-fetch'

export const getCoins = async () => {
  const url = 'https://api.coingecko.com/api/v3/coins/list'
  const res = await fetch(url)
  const data = await res.json()
  return data
}

export const getCoin = async ({ symbol }) => {
  const coins = await getCoins()
  const coin = coins.find((c) => c.symbol === symbol)
  if (!coin) {
    return null
  }

  const url = `https://api.coingecko.com/api/v3/coins/${coin.id}`
  const res = await fetch(url)
  const data = await res.json()
  return data
}
