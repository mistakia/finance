import debug from 'debug'
// import yargs from 'yargs'
// import { hideBin } from 'yargs/helpers'

// import db from '#db'
// import config from '#config'
import { isMain } from '#common'
import {
  Wheel_Trading_Account,
  Buy_And_Hold_Trading_Account,
  Holdings,
  Backtest
} from '#trading'

// const argv = yargs(hideBin(process.argv)).argv
const log = debug('backtest_wheel')
debug.enable('backtest_wheel,backtest,holdings')

const backtest_wheel = async () => {
  const wheel_1 = new Wheel_Trading_Account({
    name: 'wheel_1',
    holdings: new Holdings({ cash: 100000 })
  })
  const buy_and_hold = new Buy_And_Hold_Trading_Account({
    name: 'buy_and_hold',
    holdings: new Holdings({ cash: 100000 })
  })
  const backtest = new Backtest({
    accounts: [wheel_1, buy_and_hold],
    start: '2020-01-01',
    end: '2020-12-31'
  })

  const backtest_results = await backtest.run()
  log(backtest_results)
}

const main = async () => {
  let error
  try {
    await backtest_wheel()
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

export default backtest_wheel
