import fetch from 'node-fetch'

import config from '#root/config.mjs'

const data_headers = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.84 Safari/537.36',
  referer: 'https://www.morningstar.com/',
  apiKey: config.morningstar.data_api_key
}

const search_headers = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.84 Safari/537.36',
  referer: 'https://www.morningstar.com/',
  'x-api-key': config.morningstar.search_api_key
}

export async function searchEntity({ symbol }) {
  const url = `https://www.morningstar.com/api/v1/search/entities?q=${symbol}&limit=1&autocomplete=false`
  const options = { headers: search_headers }
  const data = await fetch(url, options).then((res) => res.json())
  if (data && data.results && data.results.length) {
    return data.results[0]
  }
  return null
}

export async function searchSecurity({ symbol }) {
  const url = `https://www.morningstar.com/api/v1/search/securities?q=${symbol}`
  const options = { headers: search_headers }
  const data = await fetch(url, options).then((res) => res.json())
  if (data && data.results && data.results.length) {
    return data.results[0]
  }
  return null
}

export async function getSecurityQuote({ secId }) {
  const url = `https://api-global.morningstar.com/sal-service/v1/etf/quote/v1/${secId}/data?benchmarkId=category`
  const options = { headers: data_headers }
  const data = await fetch(url, options).then((res) => res.json())
  return data
}
