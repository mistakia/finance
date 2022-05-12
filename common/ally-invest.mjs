import OAuth from 'oauth-1.0a'
import fetch from 'node-fetch'
import crypto from 'crypto'

export const getAccounts = async ({
  consumer_key,
  consumer_secret,
  oauth_key,
  oauth_secret
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

  const request_data = {
    url: 'https://devapi.invest.ally.com/v1/accounts.json',
    method: 'GET'
  }

  const token = {
    key: oauth_key,
    secret: oauth_secret
  }

  return await fetch(request_data.url, {
    headers: oauth.toHeader(oauth.authorize(request_data, token))
  }).then((res) => res.json())
}
