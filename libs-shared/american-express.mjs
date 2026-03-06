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

const extract_account_key = async (page) => {
  // Set up request interception to capture account_key from SPA API calls
  let captured_key = null
  const capture_handler = (request) => {
    const req_url = request.url()
    const key_match = req_url.match(/account_key=([A-F0-9]{20,})/)
    if (key_match) {
      captured_key = key_match[1]
      log('Captured account_key from request: %s', captured_key)
    }
  }

  page.on('request', capture_handler)

  // Navigate to activity page -- the SPA will make API calls containing account_key
  log('Navigating to activity page to extract account_key')
  await page.goto('https://global.americanexpress.com/activity', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  })

  // Wait for SPA to load and make API calls
  for (let poll = 0; poll < 10; poll++) {
    await wait(DIALOG_WAIT_TIME)
    if (captured_key) break
    log('Waiting for account_key... poll %d', poll + 1)
  }

  page.off('request', capture_handler)

  if (captured_key) {
    return captured_key
  }

  // Check URL for account_key parameter
  const url = new URL(page.url())
  const url_key = url.searchParams.get('account_key')
  if (url_key && url_key.length > 10) {
    log('Extracted account_key from URL: %s', url_key)
    return url_key
  }

  // Fallback: extract from page HTML content (avoids eval which Amex blocks)
  const html = await page.content()
  const html_match = html.match(/account_key[=:]["' ]+([A-F0-9]{20,})/i)
  if (html_match) {
    log('Extracted account_key from page HTML: %s', html_match[1])
    return html_match[1]
  }

  log('Could not extract account_key')
  return null
}

const download_via_api = async ({ page, account_key, to_date }) => {
  // Build download URL matching the Amex SPA pattern
  const params = new URLSearchParams({
    file_format: 'csv',
    limit: 'ALL',
    statement_end_date: to_date,
    additional_fields: 'true',
    status: 'posted',
    account_key,
    client_id: 'AmexAPI'
  })

  const url = `https://global.americanexpress.com/api/servicing/v1/financials/documents?${params.toString()}`
  log('Downloading via API: %s', url)

  // Amex blocks eval in their SPA, so page.evaluate(fetch) won't work.
  // Instead, navigate directly to the API URL -- the browser session cookies
  // will be sent automatically. The response is the CSV file content.
  let csv_body = null

  // Set up response capture before navigation
  const response_promise = page.waitForResponse(
    (response) => response.url().includes('/financials/documents'),
    { timeout: 30000 }
  ).catch(() => null)

  // Navigate to the download URL
  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  }).catch(() => {
    // Navigation may fail if it triggers a download instead of page load
  })

  const api_response = await response_promise
  if (api_response) {
    const status = api_response.status()
    csv_body = await api_response.text().catch(() => null)
    log('API response: status=%d, length=%d', status, csv_body ? csv_body.length : 0)
  }

  if (!csv_body) {
    // Fallback: try to get the page content directly (browser may have rendered the CSV)
    csv_body = await page.content().catch(() => null)
    if (csv_body) {
      // Strip any HTML wrapper if the browser rendered the CSV as HTML
      const pre_match = csv_body.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i)
      if (pre_match) {
        csv_body = pre_match[1]
      } else if (csv_body.startsWith('<!DOCTYPE') || csv_body.startsWith('<html')) {
        // The page rendered as HTML, not CSV -- extract text content
        csv_body = csv_body.replace(/<[^>]+>/g, '').trim()
      }
    }
  }

  if (csv_body && csv_body.length > 0) {
    if (csv_body.includes('Date') || csv_body.includes('Amount') ||
        (csv_body.includes(',') && csv_body.includes('\n'))) {
      log('API returned CSV data (%d bytes)', csv_body.length)
      return csv_body
    }
    log('API response does not look like CSV: %s', csv_body.substring(0, 300))
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

    // Extract account_key from the activity page
    const account_key = await extract_account_key(page)
    if (!account_key) {
      throw new Error('Could not determine Amex account key')
    }

    // Try API-based download (primary strategy)
    log('Attempting API-based download')
    const csv_data = await download_via_api({
      page,
      account_key,
      to_date
    })

    if (!csv_data) {
      throw new Error('API-based download failed -- no CSV data received')
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
