import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import config from '#config'
import { isMain, allyBank, addAsset } from '#libs-shared'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-ally-bank')
debug.enable('import-ally-bank,ally-bank')

const run = async ({ credentials, publicKey, cli = false }) => {
  let accounts = []

  try {
    accounts = await allyBank.getBalances({
      publicKey,
      cli,
      ...credentials,
      download_transactions: true
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
    const credentials = config.links.ally_bank
    await run({ credentials, publicKey, cli: true })
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
