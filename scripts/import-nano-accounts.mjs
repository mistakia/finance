import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import BigNumber from 'bignumber.js'

import db from '#db'
import config from '#config'
import { isMain, addAsset, nano } from '#libs-shared'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-nano-accounts')
debug.enable('import-nano-accounts')

const run = async ({ credentials, publicKey }) => {
  const data = await nano.getBalance({ ...credentials })
  const pending = BigNumber(data.account_meta.pending)
  const balance = BigNumber(data.account_meta.balance)
  const totalRaw = pending.plus(balance)
  const totalNano = nano.convertRawToNano(totalRaw)

  const inserts = []
  if (balance) {
    const asset = await addAsset({
      type: 'crypto',
      symbol: 'XNO',
      update: true
    })

    inserts.push({
      link: `/${publicKey}/nano/XNO/${credentials.address}`,
      name: 'Nano',
      cost_basis: null,
      quantity: totalNano,
      symbol: 'XNO',
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
    const credentials = config.links.nano
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
