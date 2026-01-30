import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'

import db from '#db'
import { isMain, wait } from '#libs-shared'

puppeteer.use(StealthPlugin())

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-historical-earnings-yahoo')
debug.enable('import-historical-earnings-yahoo')

dayjs.extend(utc)
dayjs.extend(timezone)

const get_consent_cookies = () => [
  {
    name: 'cmp',
    value: `t=${Math.floor(Date.now() / 1000)}&j=0&u=1YNN`,
    domain: '.yahoo.com',
    path: '/',
    secure: true
  },
  {
    name: 'gpp',
    value: 'DBABLA~BVRqAAAAAmA.QA',
    domain: '.yahoo.com',
    path: '/',
    secure: true
  },
  {
    name: 'gpp_sid',
    value: '7',
    domain: '.yahoo.com',
    path: '/',
    secure: true
  }
]

const get_yahoo_browser = async () => {
  log('Launching headless browser for Yahoo Finance requests')
  const browser = await puppeteer.launch({ headless: true })

  try {
    // Navigate to Yahoo Finance to establish session cookies
    const session_page = await browser.newPage()
    await session_page.setCookie(...get_consent_cookies())
    await session_page.goto('https://finance.yahoo.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    })
    log('Session page loaded, cookies established')

    // Get crumb by navigating directly to the crumb endpoint
    const all_cookies = await session_page.cookies()
    const crumb_page = await browser.newPage()
    await crumb_page.setCookie(...all_cookies)
    await crumb_page.goto('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      waitUntil: 'networkidle0',
      timeout: 30000
    })
    const crumb = await crumb_page.evaluate(() => document.body.innerText)
    await crumb_page.close()

    if (!crumb || crumb.length > 50 || crumb.includes('<')) {
      throw new Error(
        `Failed to obtain valid crumb from Yahoo Finance. Got: ${crumb}`
      )
    }
    log(`Obtained crumb: ${crumb}`)

    // Create API page on the query2 domain for same-origin fetch calls
    const api_page = await browser.newPage()
    await api_page.setCookie(...all_cookies)
    await api_page.goto('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      waitUntil: 'networkidle0',
      timeout: 30000
    })
    log('API page ready on query2 domain')

    await session_page.close()

    return { browser, page: api_page, crumb }
  } catch (error) {
    await browser.close()
    throw error
  }
}

const fetch_via_browser = async ({ page, url, method = 'GET', body }) => {
  return page.evaluate(
    async ({ url, method, body }) => {
      const opts = { method, credentials: 'include' }
      if (body) {
        opts.headers = { 'Content-Type': 'application/json' }
        opts.body = body
      }
      const response = await fetch(url, opts)
      if (!response.ok) {
        throw new Error(
          `Yahoo Finance API error: ${response.status} ${response.statusText}`
        )
      }
      return response.json()
    },
    { url, method, body }
  )
}

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

const request_data = async ({ page, crumb, symbol, offset = 0, limit }) => {
  log(`Requesting earnings for ${symbol}`)

  const url = `https://query2.finance.yahoo.com/v1/finance/visualization?crumb=${encodeURIComponent(crumb)}`
  const body = JSON.stringify({
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
  })

  const res = await fetch_via_browser({ page, url, method: 'POST', body })

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
  const { browser, page, crumb } = await get_yahoo_browser()

  let offset = 0
  const limit = 250
  let res
  let done = false
  let earning_inserts = []

  try {
    while (!done) {
      try {
        res = await request_data({
          page,
          crumb,
          symbol,
          offset,
          limit
        })

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
      await db('earnings')
        .insert(earning_inserts)
        .onConflict(['symbol', 'event_date'])
        .merge()
    }

    return res
  } finally {
    await browser.close()
  }
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

  process.exit()
}

if (isMain(import.meta.url)) {
  main()
}
