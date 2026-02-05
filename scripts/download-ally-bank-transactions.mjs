import path from 'path'
import fs from 'fs'
import os from 'os'
import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import config from '#config'
import { isMain, allyBank } from '#libs-shared'
import { import_file } from './import-transactions.mjs'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('download-ally-bank-transactions')
debug.enable('download-ally-bank-transactions,ally-bank')

const SOURCE_DIR = path.join(
  os.homedir(),
  'user-base/finance/source-exports/ally-bank'
)

const main = async () => {
  const public_key = argv.publicKey || argv['public-key']
  if (!public_key) {
    log('Missing --publicKey argument')
    process.exit(1)
  }

  const download_dir = argv.downloadDir || argv['download-dir'] || SOURCE_DIR
  const from_date = argv.fromDate || argv['from-date'] || null
  const to_date = argv.toDate || argv['to-date'] || null

  // Determine year subdirectory
  const year =
    argv.year || (from_date ? from_date.split('-')[0] : new Date().getFullYear())
  const year_download_dir = path.join(download_dir, String(year))

  if (!fs.existsSync(year_download_dir)) {
    fs.mkdirSync(year_download_dir, { recursive: true })
  }

  log(`Download directory: ${year_download_dir}`)

  const credentials = config.links.ally_bank
  const accounts = await allyBank.getBalances({
    publicKey: public_key,
    cli: true,
    ...credentials,
    download_transactions: true,
    download_dir: year_download_dir,
    from_date,
    to_date
  })

  log(`Downloaded transactions for ${accounts.length} accounts`)

  const successful_downloads = accounts.filter(
    (account) => account.transaction_download && account.transaction_download.success
  )

  log(`Successful downloads: ${successful_downloads.length}`)

  let total_inserted = 0
  let total_errors = 0

  for (const account of successful_downloads) {
    const file_path = path.join(
      year_download_dir,
      account.transaction_download.filename
    )

    log(`Importing transactions from ${account.transaction_download.filename}`)

    const result = await import_file({
      file_path,
      institution: 'ally-bank',
      owner: public_key
    })

    total_inserted += result.inserted
    total_errors += result.errors

    log(
      `  Account ${account.last_four}: inserted=${result.inserted}, errors=${result.errors}`
    )
  }

  log(`Import complete: inserted=${total_inserted}, errors=${total_errors}`)

  process.exit(0)
}

if (isMain(import.meta.url)) {
  main()
}
