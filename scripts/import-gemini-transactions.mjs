import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import { isMain, gemini } from '#libs-shared'
import { get_connection_credentials } from './get-connection-credentials.mjs'
import {
  parse_transactions,
  parse_transfers,
  parse_staking_history
} from '../libs-server/parsers/gemini.mjs'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-gemini-transactions')
debug.enable('import-gemini-transactions')

const SYMBOLS = ['btcusd', 'ethusd', 'ethbtc', 'ltcusd', 'zecusd', 'bchusd']

const run = async ({ credentials, publicKey }) => {
  const all_transactions = []

  // Trades (paginated)
  for (const symbol of SYMBOLS) {
    const trades = await gemini.getMyTrades({ ...credentials, symbol })
    if (Array.isArray(trades) && trades.length) {
      log(`Fetched ${trades.length} trades for ${symbol}`)
      const parsed = parse_transactions({ data: trades, owner: publicKey })
      all_transactions.push(...parsed)
    }
  }

  // Transfers (deposits/withdrawals, excluding rewards)
  const transfers = await gemini.getTransfers({ ...credentials })
  if (Array.isArray(transfers) && transfers.length) {
    log(`Fetched ${transfers.length} transfers`)
    const parsed = parse_transfers({ data: transfers, owner: publicKey })
    all_transactions.push(...parsed)
  }

  // Staking history (interest only to avoid double-counting with transfers)
  const staking = await gemini.getStakingHistory({
    ...credentials,
    interestOnly: true
  })
  if (Array.isArray(staking) && staking.length) {
    log(`Fetched ${staking.length} staking rewards`)
    const parsed = parse_staking_history({ data: staking, owner: publicKey })
    all_transactions.push(...parsed)
  }

  if (!all_transactions.length) {
    log('no transactions found')
    return
  }

  await db('transactions')
    .insert(all_transactions)
    .onConflict('link')
    .merge()
  log(`Inserted ${all_transactions.length} gemini transactions`)
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
