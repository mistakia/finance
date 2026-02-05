import debug from 'debug'
import path from 'path'
import os from 'os'
import fs from 'fs'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import config from '#config'
import { isMain } from '#libs-shared'
import { download_transactions } from '../libs-shared/capital-one.mjs'
import { parse_transactions } from '../libs-server/parsers/capital-one.mjs'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('download-capital-one')
debug.enable('download-capital-one,capital-one')

const SOURCE_DIR = path.join(
  os.homedir(),
  'user-base/finance/source-exports/capital-one'
)

const import_csv_files = async ({ directory, owner }) => {
  const files = fs.readdirSync(directory).filter((f) => f.endsWith('.csv'))
  let total = 0

  for (const file of files) {
    const file_path = path.join(directory, file)
    log(`Importing ${file}`)

    const transactions = await parse_transactions({
      file_path,
      owner
    })

    if (transactions.length) {
      await db('transactions').insert(transactions).onConflict('link').merge()
      log(`Imported ${transactions.length} transactions from ${file}`)
      total += transactions.length
    }
  }

  return total
}

const run = async ({ credentials, publicKey, from_date, to_date }) => {
  const year = from_date
    ? from_date.split('-')[0]
    : String(new Date().getFullYear())
  const download_dir = path.join(SOURCE_DIR, year)

  if (!fs.existsSync(download_dir)) {
    fs.mkdirSync(download_dir, { recursive: true })
  }

  if (argv.importOnly || argv['import-only']) {
    log(`Import-only mode: scanning ${download_dir}`)
    const total = await import_csv_files({
      directory: download_dir,
      owner: publicKey
    })
    log(`Total imported: ${total} Capital One transactions`)
    return
  }

  const user_data_dir = path.join(os.homedir(), '.capital-one-puppeteer-profile')

  log(`Downloading Capital One transactions to ${download_dir}`)
  log(`Date range: ${from_date} to ${to_date}`)

  const filename = await download_transactions({
    download_dir,
    credentials,
    from_date,
    to_date,
    user_data_dir
  })

  log(`Downloaded: ${filename}`)

  const file_path = path.join(download_dir, filename)
  log(`Importing transactions from ${file_path}`)

  const transactions = await parse_transactions({
    file_path,
    owner: publicKey
  })

  if (transactions.length) {
    log(`Inserting ${transactions.length} transactions`)
    await db('transactions').insert(transactions).onConflict('link').merge()
    log(`Imported ${transactions.length} Capital One transactions`)
  } else {
    log('No transactions parsed from downloaded file')
  }
}

export default run

const main = async () => {
  let error
  try {
    const publicKey = argv.publicKey || argv['public-key']
    if (!publicKey) {
      console.log('missing --public-key')
      return
    }

    const current_year = new Date().getFullYear()
    const from_date = argv.from || `${current_year}-01-01`
    const to_date = argv.to || new Date().toISOString().split('T')[0]

    const credentials = config.links.capital_one
    await run({ credentials, publicKey, from_date, to_date })
  } catch (err) {
    error = err
    console.log(error)
  }

  process.exit()
}

if (isMain(import.meta.url)) {
  main()
}
