import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import config from '#config'
import { isMain, wealthfront, addAsset } from '#libs-shared'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-wealthfront-accounts')
debug.enable('import-wealthfront-accounts')

const import_wealthfront_accounts = async ({
  credentials,
  publicKey,
  cli = false
}) => {
  let accounts = []

  try {
    accounts = await wealthfront.getBalances({
      publicKey,
      cli,
      ...credentials
    })
  } catch (err) {
    log(err)
  }

  log(accounts)

  const wealthfront_asset_link = `/${publicKey}/wealthfront`
  const inserts = []

  const add_cash_account = async (account) => {
    // TODO - save APY
    const asset = await addAsset({ type: 'currency', symbol: 'USD' })
    inserts.push({
      link: `${wealthfront_asset_link}/${account.type}/${account.account_id}/USD`,
      name: 'Cash',
      cost_basis: account.balance,
      quantity: account.balance,
      symbol: 'USD',
      asset_link: asset.link
    })
  }

  const add_investment_account = async (account) => {
    if (account.state === 'CLOSING' || account.state === 'CLOSED') {
      const delete_query = await db('holdings')
        .where(
          'link',
          'like',
          `${wealthfront_asset_link}/${account.type}/${account.account_id}%`
        )
        .del()
      log(
        `deleted holdings for closed account: ${account.account_id}, deleted rows: ${delete_query}`
      )
      return
    }

    for (const asset_class of account.composition.assetClasses) {
      for (const position of asset_class.funds) {
        const symbol = position.symbol
        const asset = await addAsset({ symbol, update: true })

        inserts.push({
          link: `${wealthfront_asset_link}/${account.type}/${account.account_id}/${symbol}`,
          name: `${position.displayName}`,
          cost_basis: position.costBasis,
          quantity: position.quantity,
          symbol,
          asset_link: asset.link
        })
      }
    }
  }

  for (const account of accounts) {
    switch (account.type) {
      case 'cash':
        await add_cash_account(account)
        break
      case 'investment':
        await add_investment_account(account)
        break

      default:
        log(`unrecognized wealthfront account type: ${account.type}`)
        break
    }
  }

  if (inserts.length) {
    const delete_query = await db('holdings')
      .where('link', 'like', `${wealthfront_asset_link}/%`)
      .del()
    log(`deleted ${delete_query} wealthfront holdings`)

    await db('holdings').insert(inserts).onConflict().merge()
    log(`saved ${inserts.length} wealthfront holdings`)
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
    const credentials = config.links.wealthfront
    await import_wealthfront_accounts({ credentials, publicKey, cli: true })
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

export default import_wealthfront_accounts
