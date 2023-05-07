import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import config from '#config'
import { isMain, allyInvest, addAsset } from '#libs-shared'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-ally-invest')
debug.enable('import-ally-invest')

const formatAsset = ({ item, publicKey }) => ({
  link: `/${publicKey}/ally-invest/${item.displaydata.symbol}`,
  name: item.displaydata.desc,
  cost_basis: parseFloat(item.costbasis),
  quantity: parseInt(item.qty, 10),
  symbol: item.displaydata.symbol
})

const run = async ({ credentials, publicKey }) => {
  const data = await allyInvest.getAccounts({ ...credentials })

  if (!data) {
    log('received no data or bad status code from ally invest')
    return
  }

  const inserts =
    data.response.accounts.accountsummary.accountholdings.holding.map((item) =>
      formatAsset({ item, publicKey })
    )

  for (const insert of inserts) {
    const asset = await addAsset({ symbol: insert.symbol })
    insert.asset_link = asset.link
  }

  // add cash balance
  const cash = parseFloat(
    data.response.accounts.accountsummary.accountbalance.money.total
  )
  const asset = await addAsset({ type: 'currency', symbol: 'USD' })
  inserts.push({
    link: `/${publicKey}/ally-invest/USD`,
    name: 'Cash',
    cost_basis: cash,
    quantity: cash,
    symbol: 'USD',
    asset_link: asset.link
  })

  if (inserts.length) {
    log(`saving ${inserts.length} holdings`)
    await db('holdings').insert(inserts).onConflict().merge()
  }
}

export default run

const main = async () => {
  let error
  try {
    const publicKey = argv.publicKey
    if (!publicKey) {
      console.log('missing --public-key')
      return
    }

    const credentials = config.links.ally
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
