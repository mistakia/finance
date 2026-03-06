import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import { isMain, wealthfront } from '#libs-shared'
import { get_connection_credentials } from './get-connection-credentials.mjs'
import { parse_transactions } from '../libs-server/parsers/wealthfront.mjs'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-wealthfront-transactions')
debug.enable('import-wealthfront-transactions')

const run = async ({ credentials, publicKey, cli = false }) => {
  const data = await wealthfront.getTransactions({
    publicKey,
    cli,
    ...credentials
  })

  if (!data) {
    log('no transaction data received')
    return
  }

  const transactions = parse_transactions({ data, owner: publicKey })

  if (transactions.length) {
    await db('transactions').insert(transactions).onConflict('link').merge()
    log(`Inserted ${transactions.length} wealthfront transactions`)
  }
}

const main = async () => {
  try {
    const publicKey = argv.publicKey
    if (!publicKey) {
      console.log('missing --public-key')
      return
    }
    const result = await get_connection_credentials({ connection_type: 'wealthfront', public_key: publicKey })
    const { credentials } = result
    await run({ credentials, publicKey, cli: true })
  } catch (err) {
    console.log(err)
  }

  process.exit()
}

if (isMain(import.meta.url)) {
  main()
}

export default run
