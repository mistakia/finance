import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import { isMain, kraken, addAsset } from '#libs-shared'
import { get_connection_credentials } from './get-connection-credentials.mjs'
import { create_balance_assertions } from '../libs-server/parsers/balance-assertion.mjs'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-kraken-accounts')
debug.enable('import-kraken-accounts')

const run = async ({ credentials, publicKey }) => {
  const balances = await kraken.getBalances({ ...credentials })
  const inserts = []

  for (const [asset, info] of Object.entries(balances || {})) {
    const symbol = kraken.normalizeAssetSymbol(asset)
    const quantity = parseFloat(info.balance || 0)
    if (quantity === 0) continue

    let asset_record
    try {
      asset_record = await addAsset({
        asset_type: 'crypto',
        symbol,
        update: true
      })
    } catch (err) {
      log(`Skipping unsupported asset: ${symbol} (${asset})`)
      continue
    }

    inserts.push({
      link: `/${publicKey}/kraken/${symbol}`,
      name: `Kraken ${symbol}`,
      cost_basis: null,
      quantity,
      symbol,
      asset_link: asset_record.link
    })
  }

  // Earn allocations
  const earn = await kraken.getEarnAllocations({ ...credentials })
  if (earn && Array.isArray(earn.items)) {
    for (const item of earn.items) {
      const symbol = kraken.normalizeAssetSymbol(item.native_asset)
      const quantity = parseFloat(item.amount_allocated?.total?.native || 0)
      if (quantity === 0) continue

      let asset_record
      try {
        asset_record = await addAsset({
          asset_type: 'crypto',
          symbol,
          update: true
        })
      } catch (err) {
        log(`Skipping unsupported earn asset: ${symbol}`)
        continue
      }

      inserts.push({
        link: `/${publicKey}/kraken-earn/${symbol}`,
        name: `Kraken Earn ${symbol}`,
        cost_basis: null,
        quantity,
        symbol,
        asset_link: asset_record.link
      })
    }
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
      institution: 'kraken',
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
      connection_type: 'kraken',
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
