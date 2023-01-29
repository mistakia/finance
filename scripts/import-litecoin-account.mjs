import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import config from '#config'
import { isMain, litecoin, addAsset } from '#common'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-litecoin-account')
debug.enable('import-litecoin-account')

const import_litecoin_account = async ({ credentials, publicKey }) => {
  const account = await litecoin.getAccount({ ...credentials })
  if (account) {
    const balance = litecoin.convertLitoshiToLTC(account.data.balance)
    const asset = await addAsset({ type: 'crypto', symbol: 'LTC' })

    const insert = {
      link: `/${publicKey}/litecoin/LTC/${credentials.address}`,
      name: 'Litecoin',
      cost_basis: null,
      quantity: balance,
      symbol: 'LTC',
      asset_link: asset.link
    }

    log('saving ltc holding')
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
    const credentials = config.links.litecoin
    await import_litecoin_account({ credentials, publicKey })
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

export default import_litecoin_account
