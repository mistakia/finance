import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import config from '#config'
import { isMain, stellar, addAsset } from '#libs-shared'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-stellar-accounts')
debug.enable('import-stellar-accounts')

const import_stellar_accounts = async ({ credentials, publicKey }) => {
  const balances = await stellar.getBalances({ ...credentials })

  const inserts = []
  for (const balance of balances) {
    const is_native = balance.asset_type === 'native'
    const symbol = is_native ? 'XLM' : balance.asset_code
    const name = is_native ? 'Stellar' : `Stellar Token ${symbol}`

    // TODO support stellar tokens
    const asset = await addAsset({ type: 'crypto', symbol, update: true })

    inserts.push({
      link: `/${publicKey}/stellar/${symbol}/${credentials.address}`,
      name,
      cost_basis: null,
      quantity: balance.balance,
      symbol,
      asset_link: asset.link
    })
  }

  if (inserts.length) {
    log(`saving ${inserts.length} stellar holdings`)
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
    const credentials = config.links.stellar
    await import_stellar_accounts({ credentials, publicKey })
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

export default import_stellar_accounts
