import OAuth from 'oauth-1.0a'
import fetch from 'node-fetch'
import crypto from 'crypto'

const ally_fetch = async ({
  consumer_key,
  consumer_secret,
  oauth_key,
  oauth_secret,
  url
}) => {
  const oauth = OAuth({
    consumer: {
      key: consumer_key,
      secret: consumer_secret
    },
    signature_method: 'HMAC-SHA1',
    hash_function(base_string, key) {
      return crypto.createHmac('sha1', key).update(base_string).digest('base64')
    }
  })

  const request_data = { url, method: 'GET' }
  const token = { key: oauth_key, secret: oauth_secret }

  const res = await fetch(url, {
    headers: oauth.toHeader(oauth.authorize(request_data, token))
  })

  if (res.ok) {
    return res.json()
  }

  return null
}

export const getAccounts = async (credentials) => {
  return ally_fetch({
    ...credentials,
    url: 'https://devapi.invest.ally.com/v1/accounts.json'
  })
}

export const getTransactions = async ({ account_id, ...credentials }) => {
  return ally_fetch({
    ...credentials,
    url: `https://devapi.invest.ally.com/v1/accounts/${account_id}/history.json`
  })
}
