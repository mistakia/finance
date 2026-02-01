import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import config from '#config'
import { isMain, addAsset, fidelity } from '#libs-shared'
import { create_balance_assertions } from '../libs-server/parsers/balance-assertion.mjs'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-fidelity-accounts')
debug.enable('import-fidelity-accounts,fidelity')

const import_fidelity_accounts = async ({ credentials, publicKey }) => {
  const inserts = []
  const fidelity_asset_link = `/${publicKey}/fidelity`

  try {
    // Get account data from Fidelity
    const accountData = await fidelity.get_accounts({
      public_key: publicKey,
      username: credentials.username,
      password: credentials.password,
      cli: true
    })

    log(accountData)

    // Process accounts - add cash balances
    for (const account of accountData.accounts) {
      if (account.cash_balance > 0) {
        const asset = await addAsset({ asset_type: 'currency', symbol: 'USD' })

        inserts.push({
          link: `${fidelity_asset_link}/${account.account_number}/USD`,
          name: 'Cash',
          cost_basis: account.cash_balance,
          quantity: account.cash_balance,
          symbol: 'USD',
          asset_link: asset.link
        })
      }
    }

    // Process stock positions
    const stockPositions = accountData.positions.filter(
      (p) => p.type === 'stock'
    )
    for (const position of stockPositions) {
      // Skip positions with zero quantity or value
      if (position.quantity === 0 || position.value === 0) continue

      const asset = await addAsset({
        symbol: position.symbol,
        update: true
      })

      inserts.push({
        link: `${fidelity_asset_link}/${position.symbol}`,
        name: position.name || position.symbol,
        cost_basis: position.cost_basis,
        quantity: position.quantity,
        symbol: position.symbol,
        asset_link: asset.link
      })
    }
  } catch (err) {
    log('Error importing Fidelity accounts:', err)
  }

  if (inserts.length) {
    log(inserts)
    // First delete existing Fidelity holdings
    const delete_query = await db('holdings')
      .where('link', 'like', `${fidelity_asset_link}/%`)
      .del()

    log(`Deleted ${delete_query} Fidelity holdings`)

    // Then insert new holdings
    await db('holdings').insert(inserts).onConflict('link').merge()
    log(`Inserted ${inserts.length} Fidelity holdings`)

    // Emit balance assertions
    const positions = inserts.map((h) => ({
      symbol: h.symbol,
      quantity: h.quantity,
      account_id: h.link.split('/').slice(-2, -1)[0] || 'default',
      account_type: 'brokerage',
      cost_basis: h.cost_basis,
      name: h.name
    }))
    const assertions = create_balance_assertions({
      positions,
      institution: 'fidelity',
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

    // Get credentials from config
    const credentials = config.links.fidelity
    if (!credentials || !credentials.username || !credentials.password) {
      console.log('Missing Fidelity credentials in config')
      return
    }

    await import_fidelity_accounts({
      publicKey,
      credentials
    })
  } catch (err) {
    error = err
    console.log(error)
  }

  process.exit()
}

if (isMain(import.meta.url)) {
  main()
}

export default import_fidelity_accounts
