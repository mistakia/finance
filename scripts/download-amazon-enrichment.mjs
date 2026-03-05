import debug from 'debug'
import path from 'path'
import os from 'os'
import fs from 'fs'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { get_connection_credentials } from './get-connection-credentials.mjs'
import { isMain } from '#libs-shared'
import { read_csv } from '#libs-server'
import { download_order_history } from '../libs-shared/amazon.mjs'
import { match_enrichment } from '../libs-server/parsers/amazon-enrichment.mjs'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('download-amazon')
debug.enable('download-amazon,amazon')

const SOURCE_DIR = path.join(
  os.homedir(),
  'user-base/data/finance/amazon'
)

const import_order_files = async (source_dir) => {
  const order_history_file = path.join(
    source_dir,
    'Retail.OrderHistory.1',
    'Retail.OrderHistory.1.csv'
  )

  if (!fs.existsSync(order_history_file)) {
    log('No Amazon order history file found at %s', order_history_file)
    return 0
  }

  log('Processing Amazon enrichment from %s', order_history_file)

  const order_records = await read_csv(order_history_file, {
    mapHeaders: ({ header }) => header.trim()
  })

  const returns_file = path.join(
    source_dir,
    'Retail.CustomerReturns.1.1',
    'Retail.CustomerReturns.1.1.csv'
  )
  const return_records = fs.existsSync(returns_file)
    ? await read_csv(returns_file, {
        mapHeaders: ({ header }) => header.trim()
      })
    : []

  const result = await match_enrichment({
    order_records,
    return_records,
    source_file: order_history_file
  })

  log(`Matched ${result.matched_count} of ${result.total_orders} orders`)
  return result.matched_count
}

const main = async () => {
  try {
    const public_key = argv.publicKey || argv['public-key']
    if (!public_key) {
      console.log('missing --publicKey')
      process.exit(1)
    }

    if (argv.importOnly || argv['import-only']) {
      log(`Import-only mode: processing ${SOURCE_DIR}`)
      const matched = await import_order_files(SOURCE_DIR)
      log(`Total matched: ${matched} transactions`)
      process.exit(0)
    }

    const result = await get_connection_credentials({
      connection_type: 'amazon',
      public_key
    })
    const { credentials } = result

    log(`Downloading Amazon order history to ${SOURCE_DIR}`)

    const filename = await download_order_history({
      credentials,
      download_dir: SOURCE_DIR
    })

    if (filename) {
      log(`Downloaded: ${filename}`)
    } else {
      log('No immediate download available -- Amazon data requests take time to process')
      log('Run with --import-only after data is available')
    }

    const matched = await import_order_files(SOURCE_DIR)
    log(`Total matched: ${matched} transactions`)
  } catch (err) {
    console.error(err)
  }

  process.exit()
}

if (isMain(import.meta.url)) {
  main()
}
