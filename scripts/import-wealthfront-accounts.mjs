import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import config from '#config'
import { isMain, wealthfront, addAsset } from '#common'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-wealthfront-accounts')
debug.enable('import-wealthfront-accounts')

const import_wealthfront_accounts = async ({
  credentials,
  publicKey,
  cli = false
}) => {
  let accounts = []

  try {
    accounts = await wealthfront.getBalances({
      publicKey,
      cli,
      ...credentials
    })
  } catch (err) {
    log(err)
  }

  log(accounts)

  const inserts = []
  for (const account of accounts) {
    // TODO - save APY
    const asset = await addAsset({ type: 'currency', symbol: 'USD' })
    inserts.push({
      link: `/${publicKey}/wealthfront/USD/${account.type}/${account.account_id}`,
      name: 'Cash',
      cost_basis: account.balance,
      quantity: account.balance,
      symbol: 'USD',
      asset_link: asset.link
    })
  }

  if (inserts.length) {
    log(`saving ${inserts.length} holdings`)
    await db('holdings').insert(inserts).onConflict().merge()
  }
}

const main = async () => {
  let error
  try {
    const publicKey = argv.publicKey
    if (!publicKey) {
      console.log('missing --public-key')
      return
    }
    const credentials = config.links.wealthfront
    await import_wealthfront_accounts({ credentials, publicKey, cli: true })
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

export default import_wealthfront_accounts
