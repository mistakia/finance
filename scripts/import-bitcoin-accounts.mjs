import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import config from '#config'
import { isMain, addAsset, bitcoin } from '#common'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-bitcoin-accounts')
debug.enable('import-bitcoin-accounts')

const run = async ({ credentials, publicKey }) => {
  const data = await bitcoin.getBalance({ ...credentials })
  const balance = bitcoin.convertSatsToBtc(data.address.balance)

  const inserts = []
  if (balance) {
    const asset = await addAsset({ type: 'crypto', symbol: 'BTC' })

    inserts.push({
      link: `/${publicKey}/bitcoin/BTC/${credentials.address}`,
      name: 'Bitcoin',
      cost_basis: null,
      quantity: balance,
      symbol: 'BTC',
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
