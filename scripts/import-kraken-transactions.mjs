import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import { isMain, kraken } from '#libs-shared'
import { get_connection_credentials } from './get-connection-credentials.mjs'
import {
  parse_ledger_entries,
  parse_trades
} from '../libs-server/parsers/kraken.mjs'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-kraken-transactions')
debug.enable('import-kraken-transactions')

const run = async ({ credentials, publicKey }) => {
  const all_transactions = []

  // Ledger entries (comprehensive: trades, deposits, withdrawals, staking, etc.)
  const ledgers = await kraken.getLedgers({ ...credentials })
  const ledger_count = Object.keys(ledgers).length
  if (ledger_count) {
    log(`Fetched ${ledger_count} ledger entries`)
    const parsed = parse_ledger_entries({ data: ledgers, owner: publicKey })
    all_transactions.push(...parsed)
  }

  // Trade history (supplementary detail)
  const trades = await kraken.getTradeHistory({ ...credentials })
  const trade_count = Object.keys(trades).length
  if (trade_count) {
    log(`Fetched ${trade_count} trades`)
    const parsed = parse_trades({ data: trades, owner: publicKey })
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
  log(`Inserted ${all_transactions.length} kraken transactions`)
}

const main = async () => {
  try {
    const publicKey = argv.publicKey
    if (!publicKey) {
      console.log('missing --public-key')
      return
    }
    const result = await get_connection_credentials({
      connection_type: 'kraken',
      public_key: publicKey
    })
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
