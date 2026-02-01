import debug from 'debug'
import fetch from 'node-fetch'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import config from '#config'
import { isMain, robinhood, wait } from '#libs-shared'
import { parse_transactions } from '../libs-server/parsers/robinhood.mjs'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-robinhood-transactions')
debug.enable('import-robinhood-transactions')

const get_orders = async ({ access_token, cursor }) => {
  let url = 'https://api.robinhood.com/orders/?page_size=100'
  if (cursor) {
    url = cursor
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${access_token}`
    }
  })
  if (!response.ok) {
    throw new Error(`Robinhood orders API error: ${response.status}`)
  }
  return response.json()
}

const get_instrument_symbol = async ({ instrument_url, access_token }) => {
  const response = await fetch(instrument_url, {
    headers: {
      Authorization: `Bearer ${access_token}`
    }
  })
  if (!response.ok) {
    throw new Error(`Robinhood instrument API error: ${response.status}`)
  }
  const data = await response.json()
  return data.symbol
}

const run = async ({ credentials, publicKey }) => {
  log('importing robinhood transactions')

  const device_id = await robinhood.getDeviceId()
  log(`Got device ID: ${device_id}`)
  const auth = await robinhood.login({
    device_id,
    username: credentials.username,
    password: credentials.password,
    publicKey,
    cli: true
  })
  const access_token = auth.access_token

  let cursor = null
  let total_inserted = 0

  do {
    const data = await get_orders({ access_token, cursor })
    const orders = data.results || []

    // Enrich orders with symbol
    for (const order of orders) {
      if (order.instrument && !order.symbol) {
        try {
          order.symbol = await get_instrument_symbol({
            instrument_url: order.instrument,
            access_token
          })
          order.instrument_symbol = order.symbol
        } catch (err) {
          log(`Error fetching instrument symbol: ${err.message}`)
        }
      }
    }

    const transactions = parse_transactions({
      items: orders,
      owner: publicKey
    })

    if (transactions.length) {
      log(`Inserting ${transactions.length} transactions`)
      await db('transactions').insert(transactions).onConflict('link').merge()
      total_inserted += transactions.length
    }

    cursor = data.next
    if (cursor) {
      await wait(1000)
    }
  } while (cursor)

  log(`Imported ${total_inserted} Robinhood transactions`)
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

    const credentials = config.links.robinhood
    await run({ credentials, publicKey })
  } catch (err) {
    error = err
    console.log(error)
  }

  process.exit()
}

if (isMain(import.meta.url)) {
  main()
}
