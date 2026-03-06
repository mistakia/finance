import debug from 'debug'
import fs from 'fs'
import path from 'path'
import os from 'os'

import { launch_persistent_context, create_page, wait } from './stealth-browser.mjs'

const log = debug('american-express')

const DIALOG_WAIT_TIME = 3000
const AUTH_WAIT_TIMEOUT = 180000

const DEFAULT_PROFILE_DIR = path.join(os.homedir(), '.amex-stealth-profile')

const create_target_filename = (from_date, to_date) => {
  return `american_express_card_${from_date}_to_${to_date}.csv`
}

const is_authenticated = (url) => {
  return (
    url.includes('/dashboard') ||
    url.includes('/activity') ||
    url.includes('/summary')
  )
}

const attempt_login = async ({ page, credentials }) => {
  log('Navigating to American Express login')
  await page.goto('https://www.americanexpress.com/en-us/account/login', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  })
  await wait(DIALOG_WAIT_TIME * 2)

  if (is_authenticated(page.url())) {
    log('Already authenticated via session cookies')
    return true
  }

  const username_input = page.locator('#eliloUserID')
  try {
    await username_input.waitFor({ timeout: 15000 })
  } catch {
    log('No login form found')
    return false
  }

  await username_input.fill(credentials.username)
  await wait(1000)

  const password_input = page.locator('#eliloPassword')
  await password_input.fill(credentials.password)
  await wait(1000)

  const signin_button = page.locator('#loginSubmit')
  await signin_button.click()
  log('Submitted login form')

  try {
    await page.waitForURL(
      (url) => is_authenticated(url.toString()),
      { timeout: 30000 }
    )
    return true
  } catch {
    log('Did not reach dashboard after login -- may need 2FA')
  }

  return is_authenticated(page.url())
}

const wait_for_authentication = async (page) => {
  log('Waiting for manual authentication (2FA) -- up to 3 minutes')
  const start = Date.now()
  while (Date.now() - start < AUTH_WAIT_TIMEOUT) {
    if (is_authenticated(page.url())) {
      log('Authentication detected (URL: %s)', page.url())
      return true
    }
    await wait(DIALOG_WAIT_TIME)
  }
  log('Authentication timeout. Last URL: %s', page.url())
  return false
}

const download_csv = async ({ context, page, from_date, to_date }) => {
  // Navigate to activity page to capture account_token header and account_key
  log('Navigating to activity page')
  let account_token = null
  let all_api_headers = {}
  const header_handler = (request) => {
    const url = request.url()
    if (!url.includes('americanexpress.com/api/')) return
    const headers = request.headers()
    if (headers['account_token'] && !account_token) {
      account_token = headers['account_token']
      all_api_headers = { ...headers }
      log('Captured account_token from: %s', url.substring(0, 100))
    }
  }
  page.on('request', header_handler)

  await page.goto('https://global.americanexpress.com/activity', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  })
  await wait(DIALOG_WAIT_TIME * 3)
  page.off('request', header_handler)

  // Extract account_key from page HTML (eval is blocked by Amex SPA)
  const html = await page.content()
  let account_key = null
  for (const pattern of [/account_key["':=\s]+["']?([A-F0-9]{20,})/i, /accountKey["':=\s]+["']?([A-F0-9]{20,})/i]) {
    const match = html.match(pattern)
    if (match) {
      account_key = match[1]
      log('Extracted account_key from HTML: %s', account_key)
      break
    }
  }

  if (!account_key || !account_token) {
    log('Missing account_key=%s or account_token=%s', !!account_key, !!account_token)
    return null
  }

  // Build the download URL using the exact format the Amex SPA uses:
  // /api/servicing/v1/financials/documents?file_format=csv&limit=ALL
  //   &start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&status=posted
  //   &account_key=<hex>&client_id=AmexAPI
  const params = new URLSearchParams({
    file_format: 'csv',
    limit: 'ALL',
    start_date: from_date,
    end_date: to_date,
    status: 'posted',
    account_key,
    client_id: 'AmexAPI'
  })

  const url = `https://global.americanexpress.com/api/servicing/v1/financials/documents?${params.toString()}`
  log('Downloading via API: %s', url)

  // Use Playwright's APIRequestContext which runs outside the page context
  // (bypassing Amex's eval monkeypatch) but shares session cookies.
  // Forward the captured API headers -- the Amex API validates account_token.
  const skip_keys = new Set(['host', 'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform', 'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site', 'accept-encoding', 'accept-language', 'connection', 'content-length', 'content-type'])
  const headers = {}
  for (const [key, value] of Object.entries(all_api_headers)) {
    if (!skip_keys.has(key)) {
      headers[key] = value
    }
  }
  headers['accept'] = 'text/csv, application/csv, */*'

  const response = await context.request.fetch(url, { headers })
  const status = response.status()
  const body = await response.text()
  log('API response: status=%d, length=%d', status, body.length)

  if (status >= 200 && status < 300 && body.length > 50) {
    return body
  }

  if (status >= 400) {
    log('API error: %s', body.substring(0, 300))
  }

  return null
}

export const download_transactions = async ({
  download_dir,
  credentials,
  from_date = null,
  to_date = null,
  user_data_dir = null
}) => {
  if (!download_dir) {
    throw new Error('download_dir is required')
  }

  if (!credentials || !credentials.username || !credentials.password) {
    throw new Error('American Express credentials (username, password) are required')
  }

  if (!from_date) {
    const current_year = new Date().getFullYear()
    from_date = `${current_year}-01-01`
  }

  if (!to_date) {
    to_date = new Date().toISOString().split('T')[0]
  }

  if (!fs.existsSync(download_dir)) {
    fs.mkdirSync(download_dir, { recursive: true })
  }

  const profile_dir = user_data_dir || DEFAULT_PROFILE_DIR

  log('Launching stealth browser with persistent profile: %s', profile_dir)
  const context = await launch_persistent_context({
    user_data_dir: profile_dir,
    headless: false
  })

  const page = await create_page(context)

  try {
    let authenticated = await attempt_login({ page, credentials })

    if (!authenticated) {
      authenticated = await wait_for_authentication(page)
    }

    if (!authenticated) {
      throw new Error('Authentication timeout -- could not reach American Express dashboard')
    }

    log('Authenticated successfully')

    const csv_data = await download_csv({
      context,
      page,
      from_date,
      to_date
    })

    if (!csv_data) {
      throw new Error('Download failed -- no CSV data received')
    }

    const target_filename = create_target_filename(from_date, to_date)
    const target_path = path.join(download_dir, target_filename)
    fs.writeFileSync(target_path, csv_data)
    log('Saved %s (%d bytes)', target_filename, csv_data.length)
    return target_filename
  } finally {
    await context.close()
    log('Browser closed')
  }
}
