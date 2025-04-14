import debug from 'debug'
import fetch from 'node-fetch'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import config from '#config'
import {
  isMain,
  getSession,
  saveSession,
  robinhood,
  addAsset
} from '#libs-shared'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-robinhood-accounts')
debug.enable('import-robinhood-accounts')

const run = async ({ session = {}, credentials, publicKey, cli = false }) => {
  const device_id = session.device_id || (await robinhood.getDeviceId())
  const response = await robinhood.login({
    device_id,
    publicKey,
    cli,
    ...credentials
  })
  log(response)
  const token = response.access_token

  session.device_id = device_id

  const robinhood_asset_link = `/${publicKey}/robinhood`
  const accounts = await robinhood.getAccounts({ token })
  const items = []

  for (const account of accounts.results) {
    const positions = await robinhood.getAccountPositions({
      token,
      url: account.url
    })
    for (const position of positions.results) {
      const instrument_response = await fetch(position.instrument)
      const instrument_info = await instrument_response.json()

      const quantity = parseFloat(position.quantity)
      const avg_buy = parseFloat(position.average_buy_price)
      const symbol = instrument_info.symbol

      const asset = await addAsset({
        asset_type: `${instrument_info.country.toLowerCase()}_${
          instrument_info.type
        }`,
        symbol,
        update: true
      })

      items.push({
        link: `${robinhood_asset_link}/${symbol}`,
        name: `${instrument_info.simple_name}`,
        cost_basis: quantity * avg_buy,
        quantity,
        symbol,
        asset_link: asset.link
      })
    }
  }

  if (items.length) {
    const delete_query = await db('holdings')
      .where('link', 'like', `${robinhood_asset_link}/%`)
      .del()
    log(`Deleted ${delete_query} robinhood holdings`)

    await db('holdings').insert(items).onConflict('link').merge()
    log(`Inserted ${items.length} robinhood holdings`)
  }

  return session
}

export default run

const main = async () => {
  let error
  try {
    const publicKey = argv.publicKey
    if (!publicKey) {
      console.log('missing --public-key')
      return
    }

    const session = await getSession()
    const credentials = config.links.robinhood
    const result = await run({ session, credentials, publicKey, cli: true })
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

if (isMain(import.meta.url)) {
  main()
}
