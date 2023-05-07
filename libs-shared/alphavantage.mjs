import fetch from 'node-fetch'
import dayjs from 'dayjs'

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

// TODO fix this
export const getExchangeRate = async ({ symbol, base = 'USD' }) => {
  const url = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${symbol}&apikey=${config.alphavantage}&to_currency=${base}`
  const res = await fetch(url)
  const data = await res.json()

  if (!data) {
    return null
  }

  const realtime = data['Realtime Currency Exchange Rate']

  return {
    bid: parseFloat(realtime['8. Bid Price']),
    ask: parseFloat(realtime['9. Ask Price']),
    rate: parseFloat(realtime['5. Exchange Rate']),
    timestamp: dayjs(realtime['6. Last Refreshed']).unix()
  }
}
