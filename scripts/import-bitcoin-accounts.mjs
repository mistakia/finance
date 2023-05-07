import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import config from '#config'
import { isMain, addAsset, bitcoin } from '#libs-shared'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-bitcoin-accounts')
debug.enable('import-bitcoin-accounts')

const run = async ({ credentials, publicKey }) => {
  const balance_sats = await bitcoin.getBalance({ ...credentials })
  if (balance_sats) {
    const balance = bitcoin.convertSatsToBtc(balance_sats)
    const asset = await addAsset({ type: 'crypto', symbol: 'BTC' })

    const insert = {
      link: `/${publicKey}/bitcoin/BTC/${credentials.address}`,
      name: 'Bitcoin',
      cost_basis: null,
      quantity: balance,
      symbol: 'BTC',
      asset_link: asset.link
    }

    log('saving btc holding')
    await db('holdings').insert(insert).onConflict().merge()
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
    const credentials = config.links.bitcoin
    await run({ credentials, publicKey })
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

export default run
