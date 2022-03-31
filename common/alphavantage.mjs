import fetch from 'node-fetch'

import config from '#config'

export const getQuote = async ({ symbol }) => {
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${config.alphavantage}`
  const res = await fetch(url)
  const data = await res.json()
  return data
}

export const getDailyTimeSeries = async ({ symbol }) => {
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${config.alphavantage}&outputsize=full`
  const res = await fetch(url)
  const data = await res.json()
  return data
}
