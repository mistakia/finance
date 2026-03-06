import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import { isMain, gemini } from '#libs-shared'
import { get_connection_credentials } from './get-connection-credentials.mjs'
import { parse_transactions } from '../libs-server/parsers/gemini.mjs'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-gemini-transactions')
debug.enable('import-gemini-transactions')

const SYMBOLS = ['btcusd', 'ethusd', 'ethbtc', 'ltcusd', 'zecusd', 'bchusd']

const run = async ({ credentials, publicKey }) => {
  const all_trades = []

  for (const symbol of SYMBOLS) {
    const trades = await gemini.getMyTrades({ ...credentials, symbol })
    if (Array.isArray(trades) && trades.length) {
      all_trades.push(...trades)
      log(`Fetched ${trades.length} trades for ${symbol}`)
    }
  }

  if (!all_trades.length) {
    log('no trades found')
    return
  }

  const transactions = parse_transactions({
    data: all_trades,
    owner: publicKey
  })

  if (transactions.length) {
    await db('transactions').insert(transactions).onConflict('link').merge()
    log(`Inserted ${transactions.length} gemini transactions`)
  }
}

const main = async () => {
  try {
    const publicKey = argv.publicKey
    if (!publicKey) {
      console.log('missing --public-key')
      return
    }
    const result = await get_connection_credentials({ connection_type: 'gemini', public_key: publicKey })
    const { credentials } = result
    await run({ credentials, publicKey })
  } catch (err) {
    console.log(err)
  }

  process.exit()
}

if (isMain(import.meta.url)) {
  main()
}

export default run
