import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import config from '#config'
import { isMain } from '#libs-shared'
import { interactive_brokers } from '#libs-server'
import { parse_transactions } from '../libs-server/parsers/interactive-brokers.mjs'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-ib-transactions')
debug.enable('import-ib-transactions,interactive-brokers:*')

const run = async ({ credentials, publicKey }) => {
  log('importing Interactive Brokers transactions')

  const trades = await interactive_brokers.get_trades(credentials)

  if (!trades || !trades.length) {
    log('No trades found')
    return
  }

  log(`Received ${trades.length} trades`)

  const transactions = parse_transactions({
    items: trades,
    owner: publicKey
  })

  if (transactions.length) {
    log(`Inserting ${transactions.length} transactions`)
    await db('transactions').insert(transactions).onConflict('link').merge()
  }

  log(`Imported ${transactions.length} Interactive Brokers transactions`)
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

    const credentials = config.links.interactive_brokers
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
