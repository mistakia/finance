import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import { isMain, nano } from '#libs-shared'
import { get_all_connection_credentials } from './get-connection-credentials.mjs'
import { parse_transactions } from '../libs-server/parsers/nano.mjs'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-nano-transactions')
debug.enable('import-nano-transactions')

const run = async ({ credentials, publicKey }) => {
  const data = await nano.getTransactions({ ...credentials })
  if (!data || !data.length) {
    log('no transactions found')
    return
  }

  const transactions = parse_transactions({
    data,
    owner: publicKey,
    address: credentials.address
  })

  if (transactions.length) {
    await db('transactions').insert(transactions).onConflict('link').merge()
    log(`Inserted ${transactions.length} nano transactions`)
  }
}

const main = async () => {
  try {
    const publicKey = argv.publicKey
    if (!publicKey) {
      console.log('missing --public-key')
      return
    }
    const results = await get_all_connection_credentials({ connection_type: 'nano', public_key: publicKey })
    if (!results.length) {
      console.log('no nano connections found')
      return
    }
    for (const { credentials } of results) {
      await run({ credentials, publicKey })
    }
  } catch (err) {
    console.log(err)
  }

  process.exit()
}

if (isMain(import.meta.url)) {
  main()
}

export default run
