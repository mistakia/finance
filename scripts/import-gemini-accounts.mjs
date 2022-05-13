import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import config from '#config'
import { isMain, gemini, addAsset } from '#common'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-gemini-accounts')
debug.enable('import-gemini-accounts')

const run = async ({ credentials, publicKey }) => {
  const balances = await gemini.getEarnBalances({
    ...credentials
  })

  const inserts = []

  for (const balance of balances) {
    const asset = await addAsset({
      type: 'loan-crypto',
      symbol: balance.currency
    })

    inserts.push({
      link: `/${publicKey}/gemini-earn/${balance.currency}`,
      name: `Gemini Earn ${balance.currency}`,
      cost_basis: null,
      quantity: balance.balance,
      symbol: balance.currency,
      asset_link: asset.link
    })
  }

  if (inserts.length) {
    log(`saving ${inserts.length} holdings`)
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
    const credentials = config.links.gemini
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
