import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import { isMain, allyInvest } from '#libs-shared'
import { get_connection_credentials } from './get-connection-credentials.mjs'
import { parse_transactions } from '../libs-server/parsers/ally-invest.mjs'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-ally-invest-transactions')
debug.enable('import-ally-invest-transactions')

const run = async ({ credentials, publicKey }) => {
  // First get accounts to find account ID
  const accounts_data = await allyInvest.getAccounts({ ...credentials })
  if (!accounts_data) {
    log('could not fetch accounts')
    return
  }

  const account_id = accounts_data.response?.accounts?.accountsummary?.account
  if (!account_id) {
    log('could not determine account ID')
    return
  }

  const data = await allyInvest.getTransactions({ ...credentials, account_id })
  if (!data) {
    log('no transaction data received')
    return
  }

  const transactions = parse_transactions({ data, owner: publicKey })

  if (transactions.length) {
    await db('transactions').insert(transactions).onConflict('link').merge()
    log(`Inserted ${transactions.length} ally invest transactions`)
  }
}

const main = async () => {
  try {
    const publicKey = argv.publicKey
    if (!publicKey) {
      console.log('missing --public-key')
      return
    }
    const result = await get_connection_credentials({ connection_type: 'ally-invest', public_key: publicKey })
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
