import debug from 'debug'
import dayjs from 'dayjs'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

// import db from '#db'
// import config from '#config'
import { isMain } from '#libs-shared'
import { Trashman_Core_V2_Trading_Account, Backtest, Holdings } from '#trading'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('backtest-core-strategies')
debug.enable(
  'backtest-core-strategies,trashman_core_v2_trading_account,backtest,holdings'
)

const backtest_core_strategies = async ({
  start_date = '2022-12-01',
  end_date = dayjs().format('YYYY-MM-DD')
}) => {
  console.time('backtest_core_strategies')

  const trading_strategy_accounts = []

  const trading_strategy_account = new Trashman_Core_V2_Trading_Account({
    name: 'Trashman Core V2',
    holdings: new Holdings({ cash: 100000 })
  })
  await trading_strategy_account.init(start_date)
  trading_strategy_accounts.push(trading_strategy_account)

  const backtest = new Backtest({
    accounts: trading_strategy_accounts,
    start_date,
    end_date
  })

  const backtest_results = await backtest.run()

  log(backtest_results)

  console.timeEnd('backtest_core_strategies')
}
const main = async () => {
  let error
  try {
    await backtest_core_strategies({
      start_date: argv.start,
      end_date: argv.end
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

export default backtest_core_strategies
