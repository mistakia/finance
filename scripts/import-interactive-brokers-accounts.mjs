import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import ibkr, { AccountSummary } from '@stoqey/ibkr'

import db from '#db'
import config from '#config'
import { isMain, addAsset } from '#common'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-interactive-brokers-accounts')
debug.enable('import-interactive-brokers-accounts')

const import_interactive_brokers_accounts = async ({
  credentials,
  publicKey
}) => {
  const inserts = []
  try {
    const { host, port } = credentials
    await ibkr.default({ port, host })

    const asset = await addAsset({ type: 'currency', symbol: 'USD' })
    const cash_balance = Number(
      AccountSummary.Instance.accountSummary.AvailableFunds
    )

    inserts.push({
      link: `/${publicKey}/interactive_brokers/USD`, // TODO - include hash of accountId
      name: 'Cash',
      cost_basis: cash_balance,
      quantity: cash_balance,
      symbol: 'USD',
      asset_link: asset.link
    })

    // const portfolios = Portfolios.Instance
    // const accountPortfolios = await portfolios.getPortfolios()
    // log(accountPortfolios)

    // // Subscribe to portfolio updates
    // IbkrEvents.Instance.on(IBKREVENTS.PORTFOLIOS, (porfolios) => {
    //   // use porfolios  updates here
    //   log(porfolios)
    // })
  } catch (err) {
    log(err)
  }

  if (inserts.length) {
    log(`Inserting ${inserts.length} interactive brokers accounts`)
    await db('holdings').insert(inserts).onConflict().merge()
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

    const credentials = config.links.interactive_brokers
    await import_interactive_brokers_accounts({ publicKey, credentials })
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

export default import_interactive_brokers_accounts
