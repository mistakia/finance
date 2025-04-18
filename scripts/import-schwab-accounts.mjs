import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import config from '#config'
import { isMain, schwab, addAsset } from '#libs-shared'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-schwab-account')
debug.enable('import-schwab-account')

const import_schwab_accounts = async ({
  credentials,
  publicKey,
  cli = false
}) => {
  let accounts = []
  try {
    accounts = await schwab.get_accounts({
      publicKey,
      cli,
      ...credentials
    })
  } catch (err) {
    log(err)
  }

  const inserts = []

  const schwab_asset_link = `/${publicKey}/schwab`

  const add_cash_position = async (position) => {
    const asset = await addAsset({ asset_type: 'currency', symbol: 'USD' })
    const balance = Number(position.Totals.MarketValue)

    inserts.push({
      link: `/${publicKey}/schwab/USD`,
      name: 'Cash',
      cost_basis: balance,
      quantity: balance,
      symbol: 'USD',
      asset_link: asset.link
    })
  }

  const add_instrument_position = async (position) => {
    const symbol = position.QuoteSymbol
    const asset = await addAsset({ symbol, update: true })

    inserts.push({
      link: `${schwab_asset_link}/${symbol}`,
      name: `${position.Description}`,
      cost_basis: position.Cost,
      quantity: position.Quantity,
      symbol,
      asset_link: asset.link
    })
  }

  for (const account of accounts) {
    for (const grouping of account.SecurityGroupings) {
      switch (grouping.GroupName) {
        case 'Equity':
        case 'ETF':
          for (const position of grouping.Positions) {
            await add_instrument_position(position)
          }
          break

        case 'Cash':
          await add_cash_position(grouping)
          break

        default:
          log(`unrecognized groupName: ${grouping.GroupName}`)
      }
    }
  }

  if (inserts.length) {
    const delete_query = await db('holdings')
      .where('link', 'like', `${schwab_asset_link}/%`)
      .del()

    log(`Deleted ${delete_query} schwab holdings`)

    await db('holdings').insert(inserts).onConflict('link').merge()
    log(`Saved ${inserts.length} schwab holdings`)
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

    const credentials = config.links.schwab
    await import_schwab_accounts({ credentials, publicKey, cli: true })
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

export default import_schwab_accounts
