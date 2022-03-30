import debug from 'debug'
import cli_prompt from 'prompt'
import fetch from 'node-fetch'
// import yargs from 'yargs'
// import { hideBin } from 'yargs/helpers'

import db from '#db'
import config from '#config'
import { isMain, getSession, saveSession } from '#common'

// const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-robinhood-accounts')
debug.enable('import-robinhood-accounts')

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
  const device_id = session.device_id || (await robinhood.getDeviceId())
  const response = await robinhood.login({
    device_id,
    publicKey,
    ...credentials
  })
  log(response)
  const token = response.access_token

  session.device_id = device_id

  const accounts = await robinhood.getAccounts({ token })
  // log(accounts)
  const items = []
  for (const account of accounts.results) {
    // log(await getAccount({ token, url: account.url }))
    const positions = await robinhood.getAccountPositions({
      token,
      url: account.url
    })
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
