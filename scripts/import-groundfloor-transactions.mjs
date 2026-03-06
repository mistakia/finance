import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import { isMain, groundfloor } from '#libs-shared'
import { get_connection_credentials } from './get-connection-credentials.mjs'
import { parse_transactions } from '../libs-server/parsers/groundfloor.mjs'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-groundfloor-transactions')
debug.enable('import-groundfloor-transactions')

const run = async ({ credentials, publicKey }) => {
  const data = await groundfloor.getTransactionHistory({ ...credentials })
  if (!data || !data.length) {
    log('no transaction data received')
    return
  }

  const transactions = parse_transactions({ data, owner: publicKey })

  if (transactions.length) {
    await db('transactions').insert(transactions).onConflict('link').merge()
    log(`Inserted ${transactions.length} groundfloor transactions`)
  }
}

const main = async () => {
  try {
    const publicKey = argv.publicKey
    if (!publicKey) {
      console.log('missing --public-key')
      return
    }
    const result = await get_connection_credentials({ connection_type: 'groundfloor', public_key: publicKey })
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
