import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import path, { dirname } from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs-extra'

// import db from '#db'
// import config from '#config'
import { isMain } from '#libs-shared'
import { chunk_inserts } from '#libs-server'
import {
  Option_Trading_Account,
  Buy_And_Hold_Trading_Account,
  Holdings,
  Backtest
} from '#trading'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('backtest_options')
debug.enable('backtest_options,trading_account,backtest')

const backtest_options = async ({
  start_date = '2022-12-01',
  end_date = '2022-12-31'
} = {}) => {
  console.time('backtest_options')
  const options_trading = []

  const max_delta_options = [
    0.01, 0.03, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5
  ]
  const max_dte_options = [
    3, 7, 14,
    // 20,
    30, 40, 50, 60, 90, 120
    // 150
  ]
  const min_dte_options = [1, 14, 30]
  const entry_min_day_change_options = [
    1,
    // 5,
    7, 14, 30, 60, 90, 120
  ]

  const option_exit_min_profit_percentage_options = [
    Infinity,
    0.1,
    0.2,
    0.3,
    0.4,
    0.5,
    0.6,
    0.7,
    0.8,
    0.9
  ]

  const option_exit_dte_options = [0, 1, 5, 7, 14]

  const equity_exit_min_profit_percentage_options = [
    Infinity,
    0,
    // 0.01,
    // 0.02,
    0.05,
    0.1,
    // 0.15,
    0.2,
    0.3
  ]

  for (const min_dte of min_dte_options) {
    for (const max_dte of max_dte_options) {
      if (min_dte > max_dte) continue
      for (const option_exit_dte of option_exit_dte_options) {
        if (option_exit_dte > max_dte) continue
        for (const option_exit_min_profit_percentage of option_exit_min_profit_percentage_options) {
          for (const equity_exit_min_profit_percentage of equity_exit_min_profit_percentage_options) {
            for (const max_delta of max_delta_options) {
              for (const entry_min_day_change of entry_min_day_change_options) {
                options_trading.push(
                  new Option_Trading_Account({
                    name: `option_delta${max_delta}_min_dte${min_dte}d_max_dte${max_dte}d_option_exit_min_profit_percentage${option_exit_min_profit_percentage}_option_exit_dte${option_exit_dte}_equity_exit_min_profit_percentage${equity_exit_min_profit_percentage}_entry_min_day_change${entry_min_day_change}`,
                    holdings: new Holdings({ cash: 200000 }),
                    max_delta,
                    max_dte,
                    min_dte,
                    option_exit_min_profit_percentage,
                    option_exit_dte,
                    equity_exit_min_profit_percentage,
                    entry_min_day_change
                  })
                )
              }
            }
          }
        }
      }
    }
  }

  const buy_and_hold = new Buy_And_Hold_Trading_Account({
    name: 'buy_and_hold',
    holdings: new Holdings({ cash: 200000 })
  })

  const backtest = new Backtest({
    accounts: [...options_trading, buy_and_hold],
    start_date,
    end_date
  })

  const backtest_results = await backtest.run()
  const backtest_inserts = []
  for (const [backtest_name, backtest_result] of Object.entries(
    backtest_results
  )) {
    backtest_inserts.push({
      name: backtest_name,
      start_date,
      end_date,
      ...backtest_result
    })
  }

  log('backtest complete')

  if (backtest_inserts.length) {
    log(`saving ${backtest_inserts.length} backtest results`)
    let counter = 0
    await chunk_inserts({
      chunk_size: 200000,
      inserts: backtest_inserts,
      save: async (chunk) => {
        const __dirname = dirname(fileURLToPath(import.meta.url))
        const data_path = path.join(__dirname, '../data')

        const json_file_path = `${data_path}/backtest_${counter}.json`

        await fs.writeJson(json_file_path, chunk, { spaces: 2 })
        log(`wrote json to ${json_file_path}`)

        counter += 1

        // await db('backtests').insert(chunk).onConflict().merge()
        // log(`inserted ${chunk.length} backtests`)
      }
    })
  }

  console.timeEnd('backtest_options')
}

const main = async () => {
  let error
  try {
    await backtest_options({
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

export default backtest_options
