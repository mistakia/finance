// Koinly Transaction Import
//
// Prerequisites:
//   1. Log in to https://app.koinly.io in the main Chrome browser (Default profile)
//   2. Ensure the session is active (dashboard loads without re-authentication)
//
// How it works:
//   - Copies cookies from ~/Library/Application Support/Google/Chrome/Default
//     into a dedicated puppeteer profile at ~/.koinly-puppeteer-profile
//   - Launches headless puppeteer, navigates to app.koinly.io to pass Cloudflare
//   - Extracts API_KEY and PORTFOLIO_ID from cookies set by the Koinly app
//   - Makes paginated API calls to api.koinly.io/api/transactions from within
//     the browser context (bypasses Cloudflare since the browser holds cf_clearance)
//   - Parses and inserts transactions into the database
//
// If the import fails with auth errors:
//   - Open Chrome, navigate to app.koinly.io, and log in again
//   - Delete ~/.koinly-puppeteer-profile to force a fresh cookie copy
//   - Re-run the import
//
// Usage:
//   node scripts/import-koinly.mjs --publicKey <owner_public_key>

import debug from 'debug'
import puppeteer from 'puppeteer'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import fs from 'fs'
import path from 'path'
import os from 'os'

import db from '#db'
import config from '#config'
import { isMain, wait } from '#libs-shared'
import { parse_transactions } from '../libs-server/parsers/koinly.mjs'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-transactions-koinly')
debug.enable('import-transactions-koinly')

const KOINLY_PROFILE_DIR = path.join(os.homedir(), '.koinly-puppeteer-profile')
const CHROME_DEFAULT_PROFILE = path.join(
  os.homedir(),
  'Library/Application Support/Google/Chrome/Default'
)

const ensure_profile = () => {
  const profile_default = path.join(KOINLY_PROFILE_DIR, 'Default')
  fs.mkdirSync(profile_default, { recursive: true })

  const source_cookies = path.join(CHROME_DEFAULT_PROFILE, 'Cookies')
  const dest_cookies = path.join(profile_default, 'Cookies')

  if (fs.existsSync(source_cookies)) {
    fs.copyFileSync(source_cookies, dest_cookies)
    const source_journal = `${source_cookies}-journal`
    if (fs.existsSync(source_journal)) {
      fs.copyFileSync(source_journal, `${dest_cookies}-journal`)
    }
    log('Copied cookies from main Chrome profile')
  }

  const source_ls = path.join(CHROME_DEFAULT_PROFILE, 'Local Storage')
  const dest_ls = path.join(profile_default, 'Local Storage')
  if (fs.existsSync(source_ls)) {
    fs.cpSync(source_ls, dest_ls, { recursive: true })
    log('Copied Local Storage from main Chrome profile')
  }
}

const launch_browser = async () => {
  ensure_profile()

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      `--user-data-dir=${KOINLY_PROFILE_DIR}`,
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--disable-default-apps'
    ]
  })
  const page = await browser.newPage()
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36'
  )
  return { page, browser }
}

const getTransactions = async ({
  page: browser_page,
  api_page,
  auth_token,
  portfolio_token,
  publicKey
}) => {
  const url = `https://api.koinly.io/api/transactions?per_page=100&order=date&page=${api_page}`
  log(url)

  const data = await browser_page.evaluate(
    async (fetch_url, token, portfolio) => {
      const res = await fetch(fetch_url, {
        headers: {
          'x-auth-token': token,
          'x-portfolio-token': portfolio
        }
      })
      return await res.json()
    },
    url,
    auth_token,
    portfolio_token
  )

  log(data.meta.page)
  log(`Received ${data.transactions.length} transactions`)

  const inserts = parse_transactions({
    items: data.transactions,
    owner: publicKey
  })

  if (inserts.length) {
    log(`Inserting ${inserts.length} transactions into database`)
    await db('transactions').insert(inserts).onConflict('link').merge()
  }

  return data
}

const run = async ({ credentials, publicKey }) => {
  log('importing transactions')

  const { page, browser } = await launch_browser()

  try {
    // Navigate to Koinly to pass Cloudflare challenge
    log('Navigating to Koinly to pass Cloudflare...')
    await page.goto('https://app.koinly.io', {
      waitUntil: 'networkidle2',
      timeout: 60000
    })
    await new Promise((resolve) => setTimeout(resolve, 5000))

    // Extract auth tokens from cookies
    const cookies = await page.cookies('https://app.koinly.io')
    const api_key_cookie = cookies.find((c) => c.name === 'API_KEY')
    const portfolio_cookie = cookies.find((c) => c.name === 'PORTFOLIO_ID')

    const auth_token =
      api_key_cookie?.value || credentials.auth_token
    const portfolio_token =
      portfolio_cookie?.value || credentials.portfolio_token

    if (!auth_token || !portfolio_token) {
      throw new Error(
        'Could not find Koinly auth tokens. Please log in to Koinly in Chrome first.'
      )
    }

    log(`Auth token: ${auth_token.substring(0, 8)}...`)
    log(`Portfolio: ${portfolio_token.substring(0, 8)}...`)

    let api_page = 1
    let res
    let pages_imported = 0
    do {
      res = await getTransactions({
        page,
        api_page,
        auth_token,
        portfolio_token,
        publicKey
      })
      if (res) {
        pages_imported += 1
        api_page += 1
      }

      await wait(3000)
    } while (res && api_page <= res.meta.page.total_pages)

    if (pages_imported === 0) {
      throw new Error('No Koinly transaction pages were successfully imported')
    }

    log(
      `Finished importing ${res.meta.page.total_items} total Koinly transactions across ${pages_imported} pages`
    )
  } finally {
    await browser.close()
  }
}

export default run

const main = async () => {
  let error
  try {
    const publicKey = argv.publicKey
    if (!publicKey) {
      console.log('missing --public-key')
      return
    }

    const credentials = config.koinly
    await run({ credentials, publicKey })
  } catch (err) {
    error = err
    console.log(error)
  }

  process.exit()
}

if (isMain(import.meta.url)) {
  main()
}
