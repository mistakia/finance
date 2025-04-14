import debug from 'debug'
import fs from 'fs'
import path from 'path'
// import yargs from 'yargs'
// import { hideBin } from 'yargs/helpers'

import db from '#db'
// import config from '#config'
import { isMain } from '#libs-shared'
import { read_csv, get_option_symbol } from '#libs-server'
import { constants } from '#trading'

// const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-spy-eod-option-quotes')
debug.enable('import-spy-eod-option-quotes')

const get_csv_files = (directory_path) => {
  let files = []

  fs.readdirSync(directory_path).forEach((file) => {
    const file_path = path.join(directory_path, file)
    const file_stats = fs.statSync(file_path)

    if (file_stats.isDirectory()) {
      files = files.concat(get_csv_files(file_path))
    } else if (path.extname(file_path) === '.txt') {
      files.push(file_path)
    }
  })

  return files
}

const format_line = (line) => {
  const {
    '[QUOTE_UNIXTIME]': quote_unixtime,
    ' [QUOTE_READTIME]': quote_readtime,
    ' [QUOTE_DATE]': quote_date,
    ' [QUOTE_TIME_HOURS]': quote_time_hours,
    ' [UNDERLYING_LAST]': underlying_last,
    ' [EXPIRE_DATE]': expire_date,
    ' [EXPIRE_UNIX]': expire_unix,
    ' [DTE]': dte,
    ' [C_DELTA]': c_delta,
    ' [C_GAMMA]': c_gamma,
    ' [C_VEGA]': c_vega,
    ' [C_THETA]': c_theta,
    ' [C_RHO]': c_rho,
    ' [C_IV]': c_iv,
    ' [C_VOLUME]': c_volume,
    ' [C_LAST]': c_last,
    ' [C_SIZE]': c_size,
    ' [C_BID]': c_bid,
    ' [C_ASK]': c_ask,
    ' [STRIKE]': strike,
    ' [P_BID]': p_bid,
    ' [P_ASK]': p_ask,
    ' [P_SIZE]': p_size,
    ' [P_LAST]': p_last,
    ' [P_DELTA]': p_delta,
    ' [P_GAMMA]': p_gamma,
    ' [P_VEGA]': p_vega,
    ' [P_THETA]': p_theta,
    ' [P_RHO]': p_rho,
    ' [P_IV]': p_iv,
    ' [P_VOLUME]': p_volume,
    ' [STRIKE_DISTANCE]': strike_distance,
    ' [STRIKE_DISTANCE_PCT]': strike_distance_pct
  } = line

  const row = {
    underlying_symbol: 'SPY',
    quote_unixtime: Number(quote_unixtime) || null,
    quote_readtime: new Date(quote_readtime.trim()),
    quote_date: quote_date.trim(),
    quote_time_hours: parseFloat(quote_time_hours) || null,
    underlying_last: parseFloat(underlying_last) || null,
    expire_date: expire_date.trim(),
    expire_unix: Number(expire_unix) || null,
    dte: Number(dte) || null,
    c_delta: parseFloat(c_delta) || null,
    c_gamma: parseFloat(c_gamma) || null,
    c_vega: parseFloat(c_vega) || null,
    c_theta: parseFloat(c_theta) || null,
    c_rho: parseFloat(c_rho) || null,
    c_iv: parseFloat(c_iv) || null,
    c_volume: Number(c_volume) || null,
    c_last: parseFloat(c_last) || null,
    c_size: Number(c_size.split(' x ')[0]) || null,
    c_bid: parseFloat(c_bid) || null,
    c_ask: parseFloat(c_ask) || null,
    strike: parseFloat(strike) || null,
    p_bid: parseFloat(p_bid) || null,
    p_ask: parseFloat(p_ask) || null,
    p_size: Number(p_size.split(' x ')[0]) || null,
    p_last: parseFloat(p_last) || null,
    p_delta: parseFloat(p_delta) || null,
    p_gamma: parseFloat(p_gamma) || null,
    p_vega: parseFloat(p_vega) || null,
    p_theta: parseFloat(p_theta) || null,
    p_rho: parseFloat(p_rho) || null,
    p_iv: parseFloat(p_iv) || null,
    p_volume: Number(p_volume) || null,
    strike_distance: parseFloat(strike_distance) || null,
    strike_distance_pct: parseFloat(strike_distance_pct) || null
  }

  return {
    put_symbol: get_option_symbol({
      option_type: constants.OPTION_TYPE.PUT,
      ...row
    }),
    call_symbol: get_option_symbol({
      option_type: constants.OPTION_TYPE.CALL,
      ...row
    }),
    ...row
  }
}

const import_spy_eod_option_quotes = async () => {
  const __dirname = path.dirname(new URL(import.meta.url).pathname)
  const directory_path = path.join(
    __dirname,
    '..',
    'data',
    'spy_eod_option_quotes'
  )
  const files = get_csv_files(directory_path)

  log(`Found ${files.length} files to import`)

  for (const file of files) {
    const data = await read_csv(file)
    const inserts = data.map((line) => format_line(line))
    await db('eod_option_quotes')
      .insert(inserts)
      .onConflict(['underlying_symbol', 'quote_date', 'expire_date', 'strike'])
      .merge()
    log(`Imported ${inserts.length} rows from ${file}`)
  }
}

const main = async () => {
  let error
  try {
    await import_spy_eod_option_quotes()
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

export default import_spy_eod_option_quotes
