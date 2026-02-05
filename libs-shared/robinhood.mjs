import fetch from 'node-fetch'
import debug from 'debug'

import websocket_prompt from '#root/api/prompt.mjs'
import prompt from 'prompt'
import { wait } from '#libs-shared'

const log = debug('robinhood')

const WORKFLOW_POLL_INTERVAL = 5000
const WORKFLOW_TIMEOUT = 120000

const postAuth = async ({ username, password, device_id, challenge_id }) => {
  const params = new URLSearchParams()
  params.append('username', username)
  params.append('password', password)
  params.append('grant_type', 'password')
  params.append('scope', 'internal')
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

const poll_push_status = async (challenge_id) => {
  log('Approve the login request in the Robinhood app...')
  const start = Date.now()
  while (Date.now() - start < WORKFLOW_TIMEOUT) {
    await wait(WORKFLOW_POLL_INTERVAL)
    const response = await fetch(
      `https://api.robinhood.com/push/${challenge_id}/get_prompts_status/`
    )
    const data = await response.json()
    log(`Push status: ${JSON.stringify(data)}`)
    if (
      data.challenge_status === 'validated' ||
      data.status === 'validated'
    ) {
      return data
    }
  }
  throw new Error('App approval timed out')
}

const advance_workflow = async (machine_id) => {
  await fetch(
    `https://api.robinhood.com/pathfinder/inquiries/${machine_id}/user_view/`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sequence: 0,
        user_input: { status: 'continue' }
      })
    }
  )
}

const initialize_machine = async (workflow_id, device_id) => {
  const response = await fetch(
    'https://api.robinhood.com/pathfinder/user_machine/',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id,
        flow: 'suv',
        input: { workflow_id }
      })
    }
  )
  const data = await response.json()
  const machine_id = data.id || data.machine_id
  if (!machine_id) {
    throw new Error(
      `Failed to initialize pathfinder machine: ${JSON.stringify(data)}`
    )
  }
  log(`Machine ID: ${machine_id}`)
  return machine_id
}

const get_verification_code = async ({ cli, publicKey }) => {
  const inputs = ['code']
  if (cli) {
    log('Enter the verification code:')
    const res = await prompt.get(inputs)
    return res.code
  }
  const res = await websocket_prompt({ publicKey, inputs })
  return res.code
}

const handle_verification_workflow = async ({
  workflow_id,
  device_id,
  cli,
  publicKey
}) => {
  log(`Handling verification workflow: ${workflow_id}`)

  const machine_id = await initialize_machine(workflow_id, device_id)

  const start_time = Date.now()
  while (Date.now() - start_time < WORKFLOW_TIMEOUT) {
    const inquiry_response = await fetch(
      `https://api.robinhood.com/pathfinder/inquiries/${machine_id}/user_view/`,
      { headers: { 'Content-Type': 'application/json' } }
    )
    const inquiry_data = await inquiry_response.json()
    log(`Inquiry response: ${JSON.stringify(inquiry_data)}`)

    const context = inquiry_data.context || inquiry_data.type_context || {}
    const sheriff = context.sheriff_challenge || {}
    const challenge_id = sheriff.id || context.challenge_id

    if (challenge_id && sheriff.type === 'prompt') {
      await poll_push_status(challenge_id)
      await advance_workflow(machine_id)
      await wait(WORKFLOW_POLL_INTERVAL)
      return true
    }

    if (challenge_id && sheriff.type !== 'prompt') {
      log(`SMS/email challenge found: ${challenge_id}`)
      const code = await get_verification_code({ cli, publicKey })
      await postChallenge({ code, challenge_id })
      log('Challenge response submitted')
      await advance_workflow(machine_id)
      await wait(WORKFLOW_POLL_INTERVAL)
      continue
    }

    // Check if workflow is approved
    const result =
      context.result ||
      inquiry_data.workflow_status ||
      inquiry_data.status
    if (
      result === 'workflow_status_approved' ||
      inquiry_data.state_name === 'Approved'
    ) {
      log('Verification workflow approved')
      return true
    }

    await wait(WORKFLOW_POLL_INTERVAL)
  }

  throw new Error('Verification workflow timed out')
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
  log(`Auth response: ${JSON.stringify(response).substring(0, 500)}`)

  if (response.access_token) {
    return response
  }

  // Handle new verification workflow (Dec 2024+)
  // Loop to handle chained workflows where Robinhood may require multiple steps
  let current_response = response
  const max_workflow_attempts = 3
  for (
    let attempt = 0;
    attempt < max_workflow_attempts && current_response.verification_workflow;
    attempt++
  ) {
    const workflow_id = current_response.verification_workflow.id
    await handle_verification_workflow({
      workflow_id,
      device_id,
      cli,
      publicKey
    })
    current_response = await postAuth({ username, password, device_id })
    if (current_response.access_token) {
      return current_response
    }
  }

  if (response.verification_workflow) {
    throw new Error(
      `Auth failed after workflow approval: ${JSON.stringify(current_response)}`
    )
  }

  // Handle legacy challenge flow
  if (response.challenge) {
    const challenge = response.challenge
    const challenge_id = challenge.id
    log(`Challenge: ${JSON.stringify(challenge)}`)

    if (challenge.type === 'prompt') {
      await poll_push_status(challenge_id)
      return postAuth({ username, password, device_id, challenge_id })
    }

    // SMS/email code challenge
    const code = await get_verification_code({ cli, publicKey })
    await postChallenge({ code, challenge_id })
    return postAuth({ username, password, device_id, challenge_id })
  }

  throw new Error(
    `Robinhood authentication failed: ${JSON.stringify(response)}`
  )
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
