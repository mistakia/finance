import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import config from '#config'
import { isMain, groundfloor, addAsset } from '#common'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-groundfloor-accounts')
debug.enable('import-groundfloor-accounts')

const import_groundfloor_accounts = async ({ credentials, publicKey }) => {
  const stairs_data = await groundfloor.getStairsAccount({ ...credentials })

  const inserts = []

  if (stairs_data) {
    const asset = await addAsset({ type: 'currency', symbol: 'USD' })
    const balance = Number(stairs_data.currentBalanceCents / 100)
    inserts.push({
      link: `/${publicKey}/groundfloor/USD/stairs`,
      name: 'Cash',
      cost_basis: balance,
      quantity: balance,
      symbol: 'USD',
      asset_link: asset.link
    })
  }

  const groundfloor_data = await groundfloor.getGroundfloorBalances({
    ...credentials
  })

  if (groundfloor_data) {
    if (groundfloor_data.moneyAtWorkAmountCents) {
      const asset = await addAsset({ type: 'loan-mortgage', symbol: 'LOAN' })
      const balance = Number(groundfloor_data.moneyAtWorkAmountCents / 100)
      inserts.push({
        link: `/${publicKey}/groundfloor/LOAN`,
        name: 'First Lien Mortgage',
        cost_basis: balance,
        quantity: balance,
        symbol: 'LOAN',
        asset_link: asset.link
      })
    }

    if (groundfloor_data.investableFundsAmountCents) {
      const asset = await addAsset({ type: 'currency', symbol: 'USD' })
      const balance = Number(groundfloor_data.investableFundsAmountCents / 100)

      inserts.push({
        link: `/${publicKey}/groundfloor/USD`,
        name: 'Cash',
        cost_basis: balance,
        quantity: balance,
        symbol: 'USD',
        asset_link: asset.link
      })
    }
  }

  if (inserts.length) {
    log(`saving ${inserts.length} groundfloor holdings`)
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

    const credentials = config.links.groundfloor
    await import_groundfloor_accounts({ credentials, publicKey })
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

export default import_groundfloor_accounts
