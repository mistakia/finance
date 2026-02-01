import path from 'path'
import { isMain } from '#libs-shared'
import db from '#db'
import debug from 'debug'
import fs from 'fs/promises'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-transactions')
debug.enable('import-transactions')

const INSTITUTION_PARSERS = {
  'ally-bank': () => import('../libs-server/parsers/ally-bank.mjs'),
  chase: () => import('../libs-server/parsers/chase.mjs'),
  'capital-one': () => import('../libs-server/parsers/capital-one.mjs'),
  'american-express': () =>
    import('../libs-server/parsers/american-express.mjs')
}

const find_csv_files = async (directory) => {
  try {
    const files = await fs.readdir(directory)
    return files
      .filter((file) => file.toLowerCase().endsWith('.csv'))
      .map((file) => path.join(directory, file))
  } catch {
    return []
  }
}

const scan_source_directory = async (source_dir, { institution, year }) => {
  const files = []
  const institutions = institution
    ? [institution]
    : Object.keys(INSTITUTION_PARSERS)

  for (const inst of institutions) {
    const inst_dir = path.join(source_dir, inst)

    try {
      await fs.access(inst_dir)
    } catch {
      continue
    }

    if (year) {
      const year_dir = path.join(inst_dir, String(year))
      const csv_files = await find_csv_files(year_dir)
      files.push(...csv_files.map((f) => ({ file_path: f, institution: inst })))
    } else {
      const entries = await fs.readdir(inst_dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const year_dir = path.join(inst_dir, entry.name)
          const csv_files = await find_csv_files(year_dir)
          files.push(
            ...csv_files.map((f) => ({ file_path: f, institution: inst }))
          )
        }
      }

      const root_csv_files = await find_csv_files(inst_dir)
      files.push(
        ...root_csv_files.map((f) => ({ file_path: f, institution: inst }))
      )
    }
  }

  return files
}

const import_file = async ({ file_path, institution, owner }) => {
  const parser_loader = INSTITUTION_PARSERS[institution]
  if (!parser_loader) {
    log(`No parser available for institution: ${institution}`)
    return { inserted: 0, skipped: 0, errors: 0 }
  }

  const parser_module = await parser_loader()
  const transactions = await parser_module.parse_transactions({
    file_path,
    owner
  })

  let inserted = 0
  let errors = 0

  for (const transaction of transactions) {
    try {
      await db('transactions').insert(transaction).onConflict('link').merge()
      inserted++
    } catch (err) {
      log(`Error inserting transaction ${transaction.link}: ${err.message}`)
      errors++
    }
  }

  return { inserted, skipped: 0, errors }
}

const main = async () => {
  try {
    const source_dir = argv.sourceDir || argv['source-dir']
    const owner = argv.owner || argv.publicKey || argv['public-key']
    const institution = argv.institution
    const year = argv.year

    if (!source_dir) {
      log('Missing --source-dir argument')
      return 1
    }

    if (!owner) {
      log('Missing --owner argument')
      return 1
    }

    const files = await scan_source_directory(source_dir, {
      institution,
      year
    })

    if (files.length === 0) {
      log('No CSV files found')
      return 0
    }

    log(`Found ${files.length} files to process`)

    let total_inserted = 0
    let total_errors = 0
    let processed_files = 0

    for (const { file_path, institution: inst } of files) {
      log(`\nProcessing ${path.basename(file_path)} (${inst})`)

      const result = await import_file({
        file_path,
        institution: inst,
        owner
      })

      total_inserted += result.inserted
      total_errors += result.errors
      processed_files++

      log(
        `  Inserted: ${result.inserted}, Errors: ${result.errors}`
      )
    }

    log(`\nImport complete:`)
    log(`  Files processed: ${processed_files}`)
    log(`  Transactions inserted: ${total_inserted}`)
    log(`  Errors: ${total_errors}`)

    return 0
  } catch (err) {
    log(`Unhandled error: ${err.message}`)
    console.error(err)
    return 1
  }
}

export { import_file, scan_source_directory }

if (isMain(import.meta.url)) {
  main().then((exit_code) => process.exit(exit_code))
}
