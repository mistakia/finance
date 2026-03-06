import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import { isMain, zcash } from '#libs-shared'
import { get_connection_credentials } from './get-connection-credentials.mjs'
import { parse_transactions } from '../libs-server/parsers/zcash.mjs'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-zcash-transactions')
debug.enable('import-zcash-transactions')

const run = async ({ credentials, publicKey }) => {
  const data = await zcash.getTransactions({ ...credentials })
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
    log(`Inserted ${transactions.length} zcash transactions`)
  }
}

const main = async () => {
  try {
    const publicKey = argv.publicKey
    if (!publicKey) {
      console.log('missing --public-key')
      return
    }
    const result = await get_connection_credentials({ connection_type: 'zcash', public_key: publicKey })
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
