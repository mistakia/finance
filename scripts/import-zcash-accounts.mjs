import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import { isMain, zcash, addAsset } from '#libs-shared'
import { get_all_connection_credentials } from './get-connection-credentials.mjs'
import { create_balance_assertions } from '../libs-server/parsers/balance-assertion.mjs'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-zcash-accounts')
debug.enable('import-zcash-accounts')

const run = async ({ credentials, publicKey }) => {
  const balance_zatoshi = await zcash.getBalance({ ...credentials })
  if (balance_zatoshi !== null) {
    const balance = zcash.convertZatoshiToZec(balance_zatoshi)
    const asset = await addAsset({
      asset_type: 'crypto',
      symbol: 'ZEC',
      update: true
    })

    const insert = {
      link: `/${publicKey}/zcash/ZEC/${credentials.address}`,
      name: 'Zcash',
      cost_basis: null,
      quantity: balance,
      symbol: 'ZEC',
      asset_link: asset.link
    }

    log('saving zec holding')
    await db('holdings').insert(insert).onConflict('link').merge()

    const assertions = create_balance_assertions({
      positions: [{ symbol: 'ZEC', quantity: balance, address: credentials.address }],
      institution: 'zcash',
      owner: publicKey
    })
    if (assertions.length) {
      await db('transactions').insert(assertions).onConflict('link').merge()
      log(`Inserted ${assertions.length} balance assertions`)
    }
  }
}

const main = async () => {
  try {
    const publicKey = argv.publicKey
    if (!publicKey) {
      console.log('missing --public-key')
      return
    }
    const results = await get_all_connection_credentials({ connection_type: 'zcash', public_key: publicKey })
    if (!results.length) {
      console.log('no zcash connections found')
      return
    }
    for (const { credentials } of results) {
      await run({ credentials, publicKey })
    }
  } catch (err) {
    console.log(err)
  }

  process.exit()
}

if (isMain(import.meta.url)) {
  main()
}

export default run
