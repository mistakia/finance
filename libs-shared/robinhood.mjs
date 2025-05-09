import fetch from 'node-fetch'

import websocket_prompt from '#root/api/prompt.mjs'
import prompt from 'prompt'

const postAuth = async ({ username, password, device_id, challenge_id }) => {
  const params = new URLSearchParams()
  params.append('username', username)
  params.append('password', password)
  params.append('grant_type', 'password')
  params.append('score', 'internal')
  params.append('challenge_type', 'sms')
  params.append('client_id', 'c82SH0WZOsabOXGP2sxqcj34FxkvfnWRZBKlBjFS')
  params.append('scope', 'internal')
  params.append('device_token', device_id)

  const options = { method: 'POST', body: params }
  if (challenge_id) {
    options.headers = {
      'X-ROBINHOOD-CHALLENGE-RESPONSE-ID': challenge_id
    }
  }

  const response = await fetch(
    'https://api.robinhood.com/oauth2/token/',
    options
  )
  const data = await response.json()
  return data
}

const getBearerToken = async () => {
  const response = await fetch('https://robinhood.com/api/public/get_token/')
  const data = await response.json()
  return data.accessToken
}

const postChallenge = async ({ code, challenge_id }) => {
  const params = new URLSearchParams()
  params.append('response', code)
  const response = await fetch(
    `https://api.robinhood.com/challenge/${challenge_id}/respond/`,
    { method: 'POST', body: params }
  )
  const data = await response.json()
  return data
}

export const getDeviceId = async () => {
  const response = await fetch('https://robinhood.com/login')
  const cookies = response.headers.raw()['set-cookie']
  const cookie = cookies.find((c) => c.includes('device_id='))
  const found = /device_id=(?<device_id>[^;]+)/gi.exec(cookie)
  return found.groups.device_id
}

export const login = async ({
  device_id,
  username,
  password,
  publicKey,
  cli = false
}) => {
  const response = await postAuth({ username, password, device_id })

  if (response.access_token) {
    return response
  }

  if (!response.challenge) {
    throw new Error('Robinhood authentication failed')
  }

  const inputs = ['code']
  let code
  if (cli) {
    const res = await prompt.get(inputs)
    code = res.code
  } else {
    const res = await websocket_prompt({ publicKey, inputs })
    code = res.code
  }
  const challenge_id = response.challenge.id
  await postChallenge({ code, challenge_id })
  return postAuth({ username, password, device_id, challenge_id })
}

export const getAccounts = async ({ token }) => {
  const response = await fetch('https://api.robinhood.com/accounts/', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  })
  const data = await response.json()
  return data
}

export const getAccount = async ({ token, url }) => {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  })
  const data = await response.json()
  return data
}

export const getAccountPositions = async ({ token, url }) => {
  const response = await fetch(
    'https://api.robinhood.com/positions/?nonzero=true',
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  )
  const data = await response.json()
  return data
}

export const getQuote = async ({ symbol }) => {
  try {
    const token = await getBearerToken()
    const url = `https://api.robinhood.com/quotes/${symbol.toUpperCase()}/`
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
    const data = await response.json()
    return data
  } catch (err) {
    console.log(err)
    return null
  }
}

export const getInstrument = async ({ symbol }) => {
  try {
    const url = `https://api.robinhood.com/instruments/?symbol=${symbol.toUpperCase()}`
    const response = await fetch(url)
    const data = await response.json()
    return data.results[0]
  } catch (err) {
    console.log(err)
    return null
  }
}
