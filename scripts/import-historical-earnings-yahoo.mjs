import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import yahoo_finance from 'yahoo-finance2'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'

import db from '#db'
import { isMain, wait } from '#libs-shared'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-historical-earnings-yahoo')
debug.enable('import-historical-earnings-yahoo')

dayjs.extend(utc)
dayjs.extend(timezone)

// Map abbreviated time types to enum values
const map_time_type = (abbreviated_time_type) => {
  switch (abbreviated_time_type) {
    case 'TAS':
      return 'time_after_session'
    case 'AMC':
      return 'after_market_close'
    case 'BMO':
      return 'before_market_open'
    case 'DMH':
      return 'during_market_hours'
    default:
      return 'unspecified'
  }
}

const get_earnings_item = (item) => {
  return {
    symbol: item[0],
    company_name: item[1],
    event_name: item[2],
    event_date: item[3],
    event_timezone: item[8],
    event_gmt_offset_ms: item[9],
    event_date_unix: dayjs(item[3]).subtract(item[9], 'ms').unix(),
    event_time_type: map_time_type(item[4]),
    earnings_estimate: item[5],
    earnings_actual: item[6],
    earnings_surprise_pct: item[7]
  }
}

const request_data = async ({ symbol, offset = 0, limit }) => {
  log(`Requesting earnings for ${symbol}`)

  const crumb = await yahoo_finance._getCrumb(
    yahoo_finance._opts.cookieJar,
    yahoo_finance._env.fetch,
    {},
    yahoo_finance._opts.logger
  )

  const res = await yahoo_finance._fetch(
    /* eslint-disable no-template-curly-in-string */
    'https://query2.finance.yahoo.com/v1/finance/visualization',
    {
      /* eslint-enable no-template-curly-in-string */
      crumb
    },
    {
      fetchOptions: {
        method: 'POST',
        body: JSON.stringify({
          sortType: 'ASC',
          entityIdType: 'earnings',
          sortField: 'companyshortname',
          includeFields: [
            'ticker',
            'companyshortname',
            'eventname',
            'startdatetime',
            'startdatetimetype',
            'epsestimate',
            'epsactual',
            'epssurprisepct',
            'timeZoneShortName',
            'gmtOffsetMilliSeconds'
          ],
          query: {
            operator: 'and',
            operands: [
              {
                operator: 'lt',
                operands: ['startdatetime', dayjs().format('YYYY-MM-DD')]
              },
              {
                operator: 'eq',
                operands: ['region', 'us']
              },
              {
                operator: 'EQ',
                operands: ['ticker', symbol]
              }
            ]
          },
          offset,
          size: limit
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      }
    },
    'json',
    true // needsCrumb
  )

  // log(res.finance.result[0])

  if (
    !res.finance.result[0] ||
    !res.finance.result[0].documents ||
    !res.finance.result[0].documents.length
  ) {
    log(`No earnings found for ${symbol}`)
    return []
  }

  const earnings_doc = res.finance.result[0].documents.find(
    (doc) => doc.entityIdType === 'EARNINGS'
  )

  const earning_inserts = earnings_doc.rows
    .map(get_earnings_item)
    .sort((a, b) => a.event_date_unix - b.event_date_unix)

  return earning_inserts
}

const run = async (symbol) => {
  let offset = 0
  const limit = 250
  let res
  let done = false
  let earning_inserts = []

  while (!done) {
    try {
      res = await request_data({ symbol, offset, limit })

      if (res && res.length) {
        earning_inserts = earning_inserts.concat(res)
      }

      if (!res.length || res.length < limit) {
        done = true
      } else {
        offset += res.length
      }
    } catch (error) {
      log(error)
      console.log(`Error fetching earnings for ${symbol}: ${error}`)
      done = true
    }

    await wait(5000)
  }

  if (earning_inserts.length) {
    log(`Inserting ${earning_inserts.length} earnings records into database`)
    await db('earnings').insert(earning_inserts).onConflict().merge()
  }

  return res
}

export default run

const main = async () => {
  let error
  try {
    if (!argv.symbol) {
      console.log('missing --symbol path')
      process.exit()
    }
    await run(argv.symbol)
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
