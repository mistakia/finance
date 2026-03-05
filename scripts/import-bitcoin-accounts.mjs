import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import { isMain, addAsset, bitcoin } from '#libs-shared'
import { get_connection_credentials } from './get-connection-credentials.mjs'
import { create_balance_assertions } from '../libs-server/parsers/balance-assertion.mjs'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-bitcoin-accounts')
debug.enable('import-bitcoin-accounts')

const run = async ({ credentials, publicKey }) => {
  const balance_sats = await bitcoin.getBalance({ ...credentials })
  if (balance_sats) {
    const balance = bitcoin.convertSatsToBtc(balance_sats)
    const asset = await addAsset({
      asset_type: 'crypto',
      symbol: 'BTC',
      update: true
    })

    const insert = {
      link: `/${publicKey}/bitcoin/BTC/${credentials.address}`,
      name: 'Bitcoin',
      cost_basis: null,
      quantity: balance,
      symbol: 'BTC',
      asset_link: asset.link
    }

    log('saving btc holding')
    await db('holdings').insert(insert).onConflict('link').merge()

    // Emit balance assertion
    const assertions = create_balance_assertions({
      positions: [{ symbol: 'BTC', quantity: balance, address: credentials.address }],
      institution: 'bitcoin',
      owner: publicKey
    })
    if (assertions.length) {
      await db('transactions').insert(assertions).onConflict('link').merge()
      log(`Inserted ${assertions.length} balance assertions`)
    }
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
    const result = await get_connection_credentials({ connection_type: 'bitcoin', public_key: publicKey })
    const { credentials } = result
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
