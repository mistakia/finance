import debug from 'debug'
// import yargs from 'yargs'
// import { hideBin } from 'yargs/helpers'

// import db from '#db'
// import config from '#config'
import { isMain } from '#common'
import {
  Option_Trading_Account,
  Buy_And_Hold_Trading_Account,
  Holdings,
  Backtest
} from '#trading'

// const argv = yargs(hideBin(process.argv)).argv
const log = debug('backtest_options')
debug.enable('backtest_options,trading_account,backtest,holdings')

const backtest_options = async () => {
  const options_trading = []
  const delta_options = [
    0.01, 0.02, 0.03, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5
  ]
  for (const delta_option of delta_options) {
    options_trading.push(
      new Option_Trading_Account({
        name: `option_delta${delta_option}`,
        holdings: new Holdings({ cash: 200000 }),
        max_delta: delta_option,
        max_dte: 20,
        min_dte: 1
      })
    )
  }
  const buy_and_hold = new Buy_And_Hold_Trading_Account({
    name: 'buy_and_hold',
    holdings: new Holdings({ cash: 200000 })
  })
  const backtest = new Backtest({
    accounts: [...options_trading, buy_and_hold],
    start: '2022-12-01',
    end: '2022-12-31'
  })

  const backtest_results = await backtest.run()
  log(JSON.stringify(backtest_results, null, 2))

  const backtest_inserts = []
  for (const [backtest_name, backtest_result] of Object.entries(
    backtest_results
  )) {
    backtest_inserts.push({
      name: backtest_name,
      ...backtest_result
    })
  }
  log(backtest_inserts)
}

const main = async () => {
  let error
  try {
    await backtest_options()
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

export default backtest_options
