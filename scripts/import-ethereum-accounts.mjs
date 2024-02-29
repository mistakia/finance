import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import config from '#config'
import { isMain, addAsset, ethereum, wait } from '#libs-shared'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-ethereum-accounts')
debug.enable('import-ethereum-accounts')

const run = async ({ credentials, publicKey }) => {
  const data = await ethereum.getBalance({ ...credentials })

  const inserts = []
  if (data.ETH.balance) {
    const asset = await addAsset({
      type: 'crypto',
      symbol: 'ETH',
      update: true
    })

    inserts.push({
      link: `/${publicKey}/ethereum/ETH/${credentials.address}`,
      name: 'Ethereum',
      cost_basis: null,
      quantity: data.ETH.balance,
      symbol: 'ETH',
      asset_link: asset.link
    })
  }

  if (data.tokens && data.tokens.length) {
    for (const token of data.tokens) {
      const decimals = parseInt(token.tokenInfo.decimals, 10)
      const balance = ethereum.convert(token.balance, decimals)
      const { symbol, name } = token.tokenInfo

      const asset = await addAsset({ type: 'crypto', symbol, update: true })

      inserts.push({
        link: `/${publicKey}/ethereum/${symbol}/${credentials.address}`,
        name,
        cost_basis: null,
        quantity: balance,
        symbol,
        asset_link: asset.link
      })

      await wait(5000)
    }
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
    const credentials = config.links.ethereum
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
