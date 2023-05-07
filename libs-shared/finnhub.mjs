import fetch from 'node-fetch'

import config from '#config'

export const getQuote = async ({ symbol }) => {
  const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${config.finnhub_api_key}`
  const res = await fetch(url)
  const data = await res.json()
  return data
}
