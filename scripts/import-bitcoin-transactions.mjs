import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import { isMain, bitcoin } from '#libs-shared'
import { get_connection_credentials } from './get-connection-credentials.mjs'
import { parse_transactions } from '../libs-server/parsers/bitcoin.mjs'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-bitcoin-transactions')
debug.enable('import-bitcoin-transactions')

const run = async ({ credentials, publicKey }) => {
  const data = await bitcoin.getTransactions({ ...credentials })
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
    log(`Inserted ${transactions.length} bitcoin transactions`)
  }
}

const main = async () => {
  try {
    const publicKey = argv.publicKey
    if (!publicKey) {
      console.log('missing --public-key')
      return
    }
    const result = await get_connection_credentials({ connection_type: 'bitcoin', public_key: publicKey })
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
