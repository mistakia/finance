import debug from 'debug'
import dayjs from 'dayjs'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

// import db from '#db'
// import config from '#config'
import { isMain } from '#libs-shared'
import { Holdings, Trashman_Core_V2_Trading_Account } from '#trading'

const argv = yargs(hideBin(process.argv)).argv
// const log = debug('execute-trading-strategy')
debug.enable('trashman_core_v2_trading_account*,import-historical-prices-yahoo')

const execute_trading_strategy = async ({ force_import = false } = {}) => {
  const trading_account = new Trashman_Core_V2_Trading_Account({
    holdings: new Holdings({ cash: 10000 })
  })

  const last_trading_day =
    dayjs()
      .startOf('day')
      .subtract(dayjs().day() === 0 ? 2 : 1, 'day')
      .day() === 6
      ? dayjs().startOf('day').subtract(1, 'day')
      : dayjs()
          .startOf('day')
          .subtract(dayjs().day() === 0 ? 2 : 1, 'day')
  await trading_account.import_historical_quotes({ force_import })

  await trading_account.init()

  await trading_account.calculate_allocations({
    quote_date_unix: last_trading_day.unix()
  })
}

const main = async () => {
  let error
  try {
    await execute_trading_strategy({ force_import: argv.force_import })
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

export default execute_trading_strategy
