import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import config from '#config'
import { isMain, fidelity } from '#libs-shared'
import { parse_transactions } from '../libs-server/parsers/fidelity.mjs'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-fidelity-transactions')
debug.enable('import-fidelity-transactions,fidelity')

const run = async ({ credentials, publicKey }) => {
  log('importing Fidelity transactions')

  const activity_data = await fidelity.get_activity({
    public_key: publicKey,
    username: credentials.username,
    password: credentials.password,
    cli: true
  })

  if (!activity_data || !activity_data.activities || !activity_data.activities.length) {
    log('No activity data found')
    return
  }

  log(`Received ${activity_data.activities.length} activities`)

  const transactions = parse_transactions({
    items: activity_data.activities,
    owner: publicKey
  })

  if (transactions.length) {
    log(`Inserting ${transactions.length} transactions`)
    await db('transactions').insert(transactions).onConflict('link').merge()
  }

  log(`Imported ${transactions.length} Fidelity transactions`)
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

    const credentials = config.links.fidelity
    if (!credentials || !credentials.username || !credentials.password) {
      console.log('Missing Fidelity credentials in config')
      return
    }

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
