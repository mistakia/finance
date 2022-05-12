import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

// import db from '#db'
// import config from '#config'
import { isMain, morningstar, robinhood } from '#common'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('get-asset-info')
debug.enable('get-asset-info')

const run = async ({ symbol }) => {
  const entity = await morningstar.searchEntity({ symbol })
  const security = await morningstar.searchSecurity({ symbol })
  const quote = await morningstar.getSecurityQuote({ secId: security.secId })
  log(entity)
  log(security)
  log(quote)
  const robinhood_quote = await robinhood.getQuote({ symbol })
  log(robinhood_quote)
}

const main = async () => {
  let error
  try {
    const symbol = argv.symbol
    await run({ symbol })
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
