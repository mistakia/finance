import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import { isMain, binanceUs, addAsset } from '#libs-shared'
import { get_connection_credentials } from './get-connection-credentials.mjs'
import { create_balance_assertions } from '../libs-server/parsers/balance-assertion.mjs'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-binance-us-accounts')
debug.enable('import-binance-us-accounts')

const run = async ({ credentials, publicKey }) => {
  const account = await binanceUs.getAccount({ ...credentials })
  const inserts = []

  for (const balance of account.balances || []) {
    const free = parseFloat(balance.free || 0)
    const locked = parseFloat(balance.locked || 0)
    const quantity = free + locked
    if (quantity === 0) continue

    const symbol = balance.asset
    const asset = await addAsset({
      asset_type: 'crypto',
      symbol,
      update: true
    })

    inserts.push({
      link: `/${publicKey}/binance-us/${symbol}`,
      name: `Binance.US ${symbol}`,
      cost_basis: null,
      quantity,
      symbol,
      asset_link: asset.link
    })
  }

  if (inserts.length) {
    log(`saving ${inserts.length} holdings`)
    await db('holdings').insert(inserts).onConflict('link').merge()

    const positions = inserts.map((h) => ({
      symbol: h.symbol,
      quantity: h.quantity
    }))
    const assertions = create_balance_assertions({
      positions,
      institution: 'binance-us',
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
    const result = await get_connection_credentials({
      connection_type: 'binance-us',
      public_key: publicKey
    })
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
