import debug from 'debug'
import cli_prompt from 'prompt'
import fetch from 'node-fetch'
// import yargs from 'yargs'
// import { hideBin } from 'yargs/helpers'

import websocket_prompt from '../api/prompt.mjs'
import db from '../db/index.mjs'
import config from '../config.mjs'
import { isMain, getSession, saveSession } from '../common/index.mjs'

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

const login = async ({ device_id, username, password, publicKey }) => {
  const response = await postAuth({ username, password, device_id })
  log(response)

  if (response.access_token) {
    return response
  }

  const inputs = ['code']
  const { code } = await websocket_prompt({ publicKey, inputs })
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

const formatPosition = async ({ position, publicKey }) => {
  const position_info_res = await fetch(position.instrument)
  const position_info = await position_info_res.json()

  const quantity = parseFloat(position.quantity)
  const avg_buy = parseFloat(position.average_buy_price)
  const symbol = position_info.symbol
  return {
    link: `/${publicKey}/robinhood/${symbol}`,
    name: `${position_info.simple_name}`,
    cost_basis: quantity * avg_buy,
    quantity,
    symbol
  }
}

const run = async ({ session = {}, credentials, publicKey }) => {
  const device_id = session.device_id || (await getDeviceId())
  const response = await login({ device_id, publicKey, ...credentials })
  log(response)
  const token = response.access_token

  session.device_id = device_id

  const accounts = await getAccounts({ token })
  // log(accounts)
  const items = []
  for (const account of accounts.results) {
    // log(await getAccount({ token, url: account.url }))
    const positions = await getAccountPositions({ token, url: account.url })
    for (const position of positions.results) {
      const formatted = await formatPosition({ position, publicKey })
      items.push(formatted)
    }
  }

  if (items.length) {
    log(`Saving ${items.length} holdings`)
    await db('assets').insert(items).onConflict().merge()
  }

  return session
}

export default run

const main = async () => {
  let error
  try {
    const publicKey = argv.publicKey
    const session = await getSession()
    const credentials = config.links.robinhood
    const result = await run({ session, credentials, publicKey })
    await saveSession(result)
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

if (isMain()) {
  main()
}
