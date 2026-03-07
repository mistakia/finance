import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import { isMain, solana, addAsset } from '#libs-shared'
import { get_all_connection_credentials } from './get-connection-credentials.mjs'
import { create_balance_assertions } from '../libs-server/parsers/balance-assertion.mjs'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-solana-accounts')
debug.enable('import-solana-accounts')

const run = async ({ credentials, publicKey }) => {
  const address = credentials.address.split('/')[0]
  const inserts = []

  // SOL balance
  const lamports = await solana.getBalance({ address })
  const sol_balance = solana.convertLamportsToSol(lamports)
  if (sol_balance > 0) {
    const asset = await addAsset({
      asset_type: 'crypto',
      symbol: 'SOL',
      update: true
    })

    inserts.push({
      link: `/${publicKey}/solana/wallet/${address}/SOL`,
      name: `Solana SOL`,
      cost_basis: null,
      quantity: sol_balance,
      symbol: 'SOL',
      asset_link: asset.link
    })
  }

  // SPL token balances
  const tokens = await solana.getTokenBalances({ address })
  for (const token of tokens) {
    if (!token.content?.metadata?.symbol) continue
    const symbol = token.content.metadata.symbol
    const quantity = parseFloat(token.token_info?.balance || 0) /
      Math.pow(10, token.token_info?.decimals || 0)
    if (quantity === 0) continue

    let asset
    try {
      asset = await addAsset({
        asset_type: 'crypto',
        symbol,
        update: true
      })
    } catch (err) {
      log(`Skipping unsupported token: ${symbol}`)
      continue
    }

    inserts.push({
      link: `/${publicKey}/solana/wallet/${address}/${symbol}`,
      name: `Solana ${symbol}`,
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
      institution: 'solana',
      owner: publicKey,
      address
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
    const results = await get_all_connection_credentials({
      connection_type: 'solana',
      public_key: publicKey
    })
    if (!results.length) {
      console.log('no solana connections found')
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
