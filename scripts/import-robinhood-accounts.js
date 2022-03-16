import debug from 'debug'
import prompt from 'prompt'
import fetch from 'node-fetch'
// import yargs from 'yargs'
// import { hideBin } from 'yargs/helpers'

// import db from '../db/index.js'
import config from '../config.js'
import { isMain, getSession, saveSession } from '../common/index.js'

// const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-robinhood-accounts')
debug.enable('import-robinhood-accounts')

const getDeviceId = async () => {
  const response = await fetch('https://robinhood.com/login')
  const cookies = response.headers.raw()['set-cookie']
  const cookie = cookies.find((c) => c.includes('device_id='))
  const found = /device_id=(?<device_id>[^;]+)/gi.exec(cookie)
  return found.groups.device_id
}

const postAuth = async ({ username, password, device_id, challenge_id }) => {
  log(device_id)
  const params = new URLSearchParams()
  params.append('username', username)
  params.append('password', password)
  params.append('grant_type', 'password')
  params.append('score', 'internal')
  params.append('challenge_type', 'sms')
  params.append('client_id', 'c82SH0WZOsabOXGP2sxqcj34FxkvfnWRZBKlBjFS')
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

const login = async ({ device_id, username, password }) => {
  const response = await postAuth({ username, password, device_id })
  log(response)

  if (response.access_token) {
    return response
  }

  const { code } = await prompt.get(['code'])
  const challenge_id = response.challenge.id
  await postChallenge({ code, challenge_id })
  return postAuth({ username, password, device_id, challenge_id })
}

const getAccounts = async ({ token }) => {
  const response = await fetch('https://api.robinhood.com/accounts/', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  })
  const data = await response.json()
  return data
}

const getAccount = async ({ token, url }) => {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  })
  const data = await response.json()
  return data
}

const getAccountPositions = async ({ token, url }) => {
  const response = await fetch('https://api.robinhood.com/positions/', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  })
  const data = await response.json()
  return data
}

const run = async () => {
  const session = await getSession()
  const device_id = session.robinhood_device_id || (await getDeviceId())
  const response = await login({ device_id, ...config.links.robinhood })
  log(response)
  const token = response.access_token

  session.robinhood_device_id = device_id
  await saveSession(session)

  const accounts = await getAccounts({ token })
  log(accounts)
  for (const account of accounts.results) {
    // log(await getAccount({ token, url: account.url }))
    log(await getAccountPositions({ token, url: account.url }))
  }
}

export default run

const main = async () => {
  let error
  try {
    await run()
  } catch (err) {
    error = err
    console.log(error)
  }

  /* await db('jobs').insert({
   *   type: constants.jobs.EXAMPLE,
   *   succ: error ? 0 : 1,
   *   reason: error ? error.message : null,
   *   timestamp: Math.round(Date.now() / 1000)
   * })
   */
  process.exit()
}

if (isMain) {
  main()
}
