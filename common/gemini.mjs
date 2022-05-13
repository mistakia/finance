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
