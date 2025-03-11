import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { isMain } from '#libs-shared'
import { import_historical_prices_yahoo } from '#libs-server'

const argv = yargs(hideBin(process.argv)).argv
debug.enable('import-historical-prices-yahoo')

// The main functionality has been moved to libs-server/import-historical-prices-yahoo.mjs
// This script now just provides a CLI interface to that functionality

const main = async () => {
  let error
  try {
    if (!argv.symbol) {
      console.log('missing --symbol path')
      process.exit()
    }
    await import_historical_prices_yahoo({
      symbol: argv.symbol,
      start_year: argv.start
    })
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
