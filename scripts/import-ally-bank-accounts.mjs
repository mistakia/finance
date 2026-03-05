import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import { isMain, allyBank, addAsset } from '#libs-shared'
import { get_connection_credentials } from './get-connection-credentials.mjs'
import { create_balance_assertions } from '../libs-server/parsers/balance-assertion.mjs'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-ally-bank')
debug.enable('import-ally-bank,ally-bank')

const run = async ({ credentials, publicKey, cli = false, download_dir }) => {
  let accounts = []

  try {
    accounts = await allyBank.getBalances({
      publicKey,
      cli,
      ...credentials,
      download_transactions: Boolean(download_dir),
      download_dir
    })
  } catch (err) {
    log(err)
  }

  log(accounts)

  const inserts = []
  for (const account of accounts) {
    // TODO - save APY
    const asset = await addAsset({ asset_type: 'currency', symbol: 'USD' })
    inserts.push({
      link: `/${publicKey}/ally-bank/USD/${account.type}/${account.last_four}`,
      name: 'Cash',
      cost_basis: account.balance,
      quantity: account.balance,
      symbol: 'USD',
      asset_link: asset.link
    })
  }

  if (inserts.length) {
    log(`saving ${inserts.length} holdings`)
    await db('holdings').insert(inserts).onConflict('link').merge()
  }

  if (accounts.length) {
    const positions = accounts.map((account) => ({
      symbol: 'USD',
      quantity: account.balance,
      account_id: account.last_four,
      account_type: account.type
    }))
    const assertions = create_balance_assertions({
      positions,
      institution: 'ally-bank',
      owner: publicKey
    })
    if (assertions.length) {
      await db('transactions').insert(assertions).onConflict('link').merge()
      log(`Inserted ${assertions.length} balance assertions`)
    }
  }
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
    const result = await get_connection_credentials({ connection_type: 'ally-bank', public_key: publicKey })
    const { credentials } = result
    const download_dir = argv.downloadDir || argv['download-dir']
    await run({ credentials, publicKey, cli: true, download_dir })
  } catch (err) {
    error = err
    console.log(error)
  }

  /* await db('jobs').insert({
   *   type: constants.jobs.EXAMPLE,
   *   succ: error ? 0 : 1,
   *   reason: error ? error.message : null,
   *   timestamp: Math.round(Date.now() / 1000)
   * })
   */
  process.exit()
}

if (isMain(import.meta.url)) {
  main()
}
