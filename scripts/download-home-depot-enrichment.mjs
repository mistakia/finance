import debug from 'debug'
import path from 'path'
import os from 'os'
import fs from 'fs'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { get_connection_credentials } from './get-connection-credentials.mjs'
import { isMain } from '#libs-shared'
import { read_csv } from '#libs-server'
import { download_receipts } from '../libs-shared/home-depot.mjs'
import { match_enrichment } from '../libs-server/parsers/home-depot-enrichment.mjs'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('download-home-depot')
debug.enable('download-home-depot,home-depot')

const SOURCE_DIR = path.join(
  os.homedir(),
  'user-base/data/finance/home-depot'
)

const import_detail_files = async (directory) => {
  const detail_files = fs
    .readdirSync(directory)
    .filter((f) => f.toLowerCase().includes('detail') && f.endsWith('.csv'))

  let total_matched = 0

  for (const file of detail_files) {
    const file_path = path.join(directory, file)
    log(`Processing enrichment from ${file}`)

    const records = await read_csv(file_path, {
      mapHeaders: ({ header }) => header.trim()
    })

    if (!records.length) continue

    const result = await match_enrichment({
      records,
      source_file: file_path
    })

    log(`Matched ${result.matched_count} of ${result.total_receipts} receipts from ${file}`)
    total_matched += result.matched_count
  }

  return total_matched
}

const main = async () => {
  try {
    const public_key = argv.publicKey || argv['public-key']
    if (!public_key) {
      console.log('missing --publicKey')
      process.exit(1)
    }

    const year = argv.year || new Date().getFullYear()
    const download_dir = path.join(SOURCE_DIR, String(year))

    if (!fs.existsSync(download_dir)) {
      fs.mkdirSync(download_dir, { recursive: true })
    }

    if (argv.importOnly || argv['import-only']) {
      log(`Import-only mode: processing ${download_dir}`)
      const matched = await import_detail_files(download_dir)
      log(`Total matched: ${matched} transactions`)
      process.exit(0)
    }

    const result = await get_connection_credentials({
      connection_type: 'home-depot',
      public_key
    })
    const { credentials } = result

    log(`Downloading Home Depot receipts to ${download_dir}`)

    const filename = await download_receipts({
      credentials,
      download_dir
    })

    log(`Downloaded: ${filename}`)

    const matched = await import_detail_files(download_dir)
    log(`Total matched: ${matched} transactions`)
  } catch (err) {
    console.error(err)
  }

  process.exit()
}

if (isMain(import.meta.url)) {
  main()
}
