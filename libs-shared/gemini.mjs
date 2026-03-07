import crypto from 'crypto'
import fetch from 'node-fetch'

const getHeaders = ({ key, secret, payload }) => {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64')

  const signature = crypto
    .createHmac('sha384', secret)
    .update(encodedPayload)
    .digest('hex')

  return {
    'X-GEMINI-APIKEY': key,
    'X-GEMINI-PAYLOAD': encodedPayload,
    'X-GEMINI-SIGNATURE': signature
  }
}

const requestPrivate = ({ endpoint, key, secret, params = {} }) => {
  const requestPath = `/v1${endpoint}`
  const url = `https://api.gemini.com/${requestPath}`

  const payload = {
    nonce: Date.now(),
    request: requestPath,
    ...params
  }

  const headers = getHeaders({ key, secret, payload })

  return fetch(url, { method: 'POST', headers })
}

export const getAccounts = async ({ key, secret }) => {
  const response = await requestPrivate({
    key,
    secret,
    endpoint: '/account/list'
  })
  const data = await response.json()

  return data
}

export const getMyTrades = async ({ key, secret, symbol = 'btcusd' }) => {
  const all_trades = []
  let timestamp = undefined

  while (true) {
    const params = { symbol, limit_trades: 500 }
    if (timestamp !== undefined) {
      params.timestamp = timestamp
    }
    const response = await requestPrivate({
      key,
      secret,
      endpoint: '/mytrades',
      params
    })
    const data = await response.json()
    if (!Array.isArray(data) || data.length === 0) break
    all_trades.push(...data)
    if (data.length < 500) break
    timestamp = Math.min(...data.map((t) => t.timestampms)) - 1
  }

  return all_trades
}

export const getTransfers = async ({ key, secret, timestamp, limit = 50 }) => {
  const all_transfers = []
  let current_timestamp = timestamp

  while (true) {
    const params = { limit_transfers: limit }
    if (current_timestamp !== undefined) {
      params.timestamp = current_timestamp
    }
    const response = await requestPrivate({
      key,
      secret,
      endpoint: '/transfers',
      params
    })
    const data = await response.json()
    if (!Array.isArray(data) || data.length === 0) break
    all_transfers.push(...data)
    if (data.length < limit) break
    current_timestamp = Math.min(...data.map((t) => t.timestampms)) - 1
  }

  return all_transfers
}

export const getStakingBalances = async ({ key, secret }) => {
  const response = await requestPrivate({
    key,
    secret,
    endpoint: '/balances/staking'
  })
  const data = await response.json()
  return data
}

export const getStakingHistory = async ({
  key,
  secret,
  since,
  until,
  limit = 50,
  interestOnly = false
}) => {
  const all_history = []
  let current_until = until

  while (true) {
    const params = { limit }
    if (since) params.since = since
    if (current_until) params.until = current_until
    if (interestOnly) params.interestOnly = interestOnly
    const response = await requestPrivate({
      key,
      secret,
      endpoint: '/staking/history',
      params
    })
    const data = await response.json()
    if (!Array.isArray(data) || data.length === 0) break
    all_history.push(...data)
    if (data.length < limit) break
    const oldest = Math.min(
      ...data.map((d) => new Date(d.dateTime).getTime())
    )
    current_until = new Date(oldest - 1).toISOString()
  }

  return all_history
}

export const getEarnBalances = async ({ key, secret }) => {
  const accounts = await getAccounts({ key, secret })
  const params = {
    account: accounts.map((a) => a.account)
  }
  const response = await requestPrivate({
    key,
    secret,
    endpoint: '/balances/earn',
    params
  })
  const data = await response.json()

  return data
}
