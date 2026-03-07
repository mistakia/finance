import crypto from 'crypto'
import fetch from 'node-fetch'

const BASE_URL = 'https://api.binance.us'

const getSignature = ({ queryString, secret }) => {
  return crypto
    .createHmac('sha256', secret)
    .update(queryString)
    .digest('hex')
}

const requestPrivate = async ({
  method = 'GET',
  endpoint,
  key,
  secret,
  params = {}
}) => {
  const query = {
    ...params,
    timestamp: Date.now()
  }

  const queryString = new URLSearchParams(query).toString()
  const signature = getSignature({ queryString, secret })
  const url = `${BASE_URL}${endpoint}?${queryString}&signature=${signature}`

  const response = await fetch(url, {
    method,
    headers: {
      'X-MBX-APIKEY': key
    }
  })

  const data = await response.json()
  if (data.code && data.code < 0) {
    throw new Error(`Binance.US API error: ${data.msg} (${data.code})`)
  }
  return data
}

export const getAccount = async ({ key, secret }) => {
  return requestPrivate({ endpoint: '/api/v3/account', key, secret })
}

export const getMyTrades = async ({
  key,
  secret,
  symbol,
  startTime,
  fromId,
  limit = 1000
}) => {
  const all_trades = []
  let current_from_id = fromId

  while (true) {
    const params = { symbol, limit }
    if (startTime) params.startTime = startTime
    if (current_from_id) params.fromId = current_from_id

    const data = await requestPrivate({
      endpoint: '/api/v3/myTrades',
      key,
      secret,
      params
    })

    if (!Array.isArray(data) || data.length === 0) break
    all_trades.push(...data)
    if (data.length < limit) break
    current_from_id = data[data.length - 1].id + 1
  }

  return all_trades
}

export const getDeposits = async ({
  key,
  secret,
  startTime,
  endTime,
  offset = 0,
  limit = 1000
}) => {
  const all_deposits = []
  let current_offset = offset

  while (true) {
    const params = { limit, offset: current_offset }
    if (startTime) params.startTime = startTime
    if (endTime) params.endTime = endTime

    const data = await requestPrivate({
      endpoint: '/sapi/v1/capital/deposit/hisrec',
      key,
      secret,
      params
    })

    if (!Array.isArray(data) || data.length === 0) break
    all_deposits.push(...data)
    if (data.length < limit) break
    current_offset += data.length
  }

  return all_deposits
}

export const getWithdrawals = async ({
  key,
  secret,
  startTime,
  endTime,
  offset = 0,
  limit = 1000
}) => {
  const all_withdrawals = []
  let current_offset = offset

  while (true) {
    const params = { limit, offset: current_offset }
    if (startTime) params.startTime = startTime
    if (endTime) params.endTime = endTime

    const data = await requestPrivate({
      endpoint: '/sapi/v1/capital/withdraw/history',
      key,
      secret,
      params
    })

    if (!Array.isArray(data) || data.length === 0) break
    all_withdrawals.push(...data)
    if (data.length < limit) break
    current_offset += data.length
  }

  return all_withdrawals
}

export const getStakingRewards = async ({
  key,
  secret,
  product = 'STAKING',
  startTime,
  endTime,
  offset = 0,
  limit = 100
}) => {
  const all_rewards = []
  let current_offset = offset

  while (true) {
    const params = { product, limit, offset: current_offset }
    if (startTime) params.startTime = startTime
    if (endTime) params.endTime = endTime

    const data = await requestPrivate({
      endpoint: '/sapi/v1/staking/rewardsHistory',
      key,
      secret,
      params
    })

    if (!Array.isArray(data) || data.length === 0) break
    all_rewards.push(...data)
    if (data.length < limit) break
    current_offset += data.length
  }

  return all_rewards
}

export const getDistributions = async ({
  key,
  secret,
  startTime,
  endTime,
  offset = 0,
  limit = 500
}) => {
  const all_distributions = []
  let current_offset = offset

  while (true) {
    const params = { limit, offset: current_offset }
    if (startTime) params.startTime = startTime
    if (endTime) params.endTime = endTime

    const data = await requestPrivate({
      endpoint: '/sapi/v1/asset/assetDistributionHistory',
      key,
      secret,
      params
    })

    const rows = Array.isArray(data) ? data : data?.rows || []
    if (rows.length === 0) break
    all_distributions.push(...rows)
    if (rows.length < limit) break
    current_offset += rows.length
  }

  return all_distributions
}
