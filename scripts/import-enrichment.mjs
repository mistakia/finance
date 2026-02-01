import path from 'path'
import fs from 'fs'
import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { isMain } from '#libs-shared'
import { read_csv } from '#libs-server'
import { match_enrichment as match_home_depot } from '../libs-server/parsers/home-depot-enrichment.mjs'
import { match_enrichment as match_amazon } from '../libs-server/parsers/amazon-enrichment.mjs'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-enrichment')
debug.enable('import-enrichment')

const read_csv_file = async (file_path) => {
  if (!fs.existsSync(file_path)) {
    return []
  }
  return read_csv(file_path, {
    mapHeaders: ({ header }) => header.trim()
  })
}

const process_home_depot = async (source_dir) => {
  const home_depot_dir = path.join(source_dir, 'home-depot')
  if (!fs.existsSync(home_depot_dir)) {
    log('No home-depot directory found')
    return
  }

  const years = fs
    .readdirSync(home_depot_dir)
    .filter((f) => fs.statSync(path.join(home_depot_dir, f)).isDirectory())

  for (const year of years) {
    const year_dir = path.join(home_depot_dir, year)
    const detail_files = fs
      .readdirSync(year_dir)
      .filter((f) => f.toLowerCase().includes('detail') && f.endsWith('.csv'))

    for (const detail_file of detail_files) {
      const file_path = path.join(year_dir, detail_file)
      log(`Processing Home Depot enrichment: ${detail_file}`)

      const records = await read_csv_file(file_path)
      if (!records.length) continue

      const result = await match_home_depot({
        records,
        source_file: file_path
      })

      log(
        `  Matched ${result.matched_count} of ${result.total_receipts} receipts`
      )
    }
  }
}

const process_amazon = async (source_dir) => {
  const amazon_dir = path.join(source_dir, 'amazon')
  if (!fs.existsSync(amazon_dir)) {
    log('No amazon directory found')
    return
  }

  const order_history_dir = path.join(amazon_dir, 'Retail.OrderHistory.1')
  const order_history_file = path.join(
    order_history_dir,
    'Retail.OrderHistory.1.csv'
  )

  if (!fs.existsSync(order_history_file)) {
    log('No Amazon order history file found')
    return
  }

  log('Processing Amazon enrichment')
  const order_records = await read_csv_file(order_history_file)

  const returns_file = path.join(
    amazon_dir,
    'Retail.CustomerReturns.1.1',
    'Retail.CustomerReturns.1.1.csv'
  )
  const return_records = await read_csv_file(returns_file)

  const result = await match_amazon({
    order_records,
    return_records,
    source_file: order_history_file
  })

  log(`  Matched ${result.matched_count} of ${result.total_orders} orders`)
}

const main = async () => {
  try {
    const source_dir = argv.sourceDir || argv['source-dir']
    const type = argv.type

    if (!source_dir) {
      log('Missing --source-dir argument')
      return 1
    }

    if (!type || type === 'home-depot') {
      await process_home_depot(source_dir)
    }

    if (!type || type === 'amazon') {
      await process_amazon(source_dir)
    }

    return 0
  } catch (err) {
    log(`Error: ${err.message}`)
    console.error(err)
    return 1
  }
}

if (isMain(import.meta.url)) {
  main().then((exit_code) => process.exit(exit_code))
}

export default main
