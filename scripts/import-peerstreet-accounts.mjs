import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import config from '#config'
import { isMain, peerstreet, addAsset } from '#common'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-peerstreet-accounts')
debug.enable('import-peerstreet-accounts')

const run = async ({ credentials, publicKey }) => {
  const account = await peerstreet.getBalances({
    publicKey,
    ...credentials
  })

  const inserts = []

  if (account.cashBalance) {
    const asset = await addAsset({ type: 'currency', symbol: 'USD' })

    inserts.push({
      link: `/${publicKey}/peerstreet/USD`,
      name: 'Cash',
      cost_basis: account.cashBalance,
      quantity: account.cashBalance,
      symbol: 'USD',
      asset_link: asset.link
    })
  }

  if (account.loanBalance) {
    const asset = await addAsset({ type: 'loan-mortgage', symbol: 'LOAN' })

    inserts.push({
      link: `/${publicKey}/peerstreet/LOAN`,
      name: 'First Lien Mortgage',
      cost_basis: account.loanBalance,
      quantity: account.loanBalance,
      symbol: 'LOAN',
      asset_link: asset.link
    })
  }

  if (account.pocketBalance) {
    const asset = await addAsset({ type: 'note', symbol: 'NOTE' })

    inserts.push({
      link: `/${publicKey}/peerstreet/NOTE`,
      name: 'Short Term Note',
      cost_basis: account.pocketBalance,
      quantity: account.pocketBalance,
      symbol: 'NOTE',
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
    const credentials = config.links.peerstreet
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
