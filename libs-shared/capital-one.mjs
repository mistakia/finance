import debug from 'debug'
import fs from 'fs'
import path from 'path'
import os from 'os'

import { launch_persistent_context, create_page, wait } from './stealth-browser.mjs'

const log = debug('capital-one')

const DIALOG_WAIT_TIME = 3000
const AUTH_WAIT_TIMEOUT = 180000

const DEFAULT_PROFILE_DIR = path.join(os.homedir(), '.capital-one-stealth-profile')

const API_BASE = '/web-api/protected/17463/credit-cards'

const create_target_filename = (from_date, to_date) => {
  return `capital_one_credit_card_${from_date}_to_${to_date}.csv`
}

const is_authenticated = (url) => {
  return (
    url.includes('/accounts') ||
    url.includes('/dashboard') ||
    url.includes('/credit-cards') ||
    url.includes('/myaccounts')
  )
}

const attempt_login = async ({ page, credentials }) => {
  log('Navigating to Capital One sign-in')
  await page.goto('https://www.capitalone.com/sign-in/', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  })
  await wait(DIALOG_WAIT_TIME * 2)

  if (is_authenticated(page.url())) {
    log('Already authenticated via session cookies')
    return true
  }

  log('Current URL: %s', page.url())

  // Capital One may redirect to verified.capitalone.com with different selectors
  const username_selectors = ['#user-id', '#username', 'input[name="username"]', 'input[name="userId"]', 'input[type="text"]']
  let username_input = null
  for (const sel of username_selectors) {
    const locator = page.locator(sel).first()
    try {
      await locator.waitFor({ timeout: 5000, state: 'visible' })
      username_input = locator
      log('Found username input: %s', sel)
      break
    } catch {
      continue
    }
  }

  if (!username_input) {
    log('No login form found on %s', page.url())
    return false
  }

  await username_input.fill(credentials.username)
  await wait(1000)

  const password_selectors = ['#password', 'input[name="password"]', 'input[type="password"]']
  for (const sel of password_selectors) {
    const locator = page.locator(sel).first()
    if (await locator.count()) {
      await locator.fill(credentials.password)
      log('Filled password: %s', sel)
      break
    }
  }
  await wait(1000)

  const signin_selectors = ['#sign-in-btn', 'button[type="submit"]', 'button:has-text("Sign In")', 'button:has-text("Log In")']
  for (const sel of signin_selectors) {
    const locator = page.locator(sel).first()
    if (await locator.count()) {
      await locator.click()
      log('Clicked sign-in: %s', sel)
      break
    }
  }
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

const extract_account_id = (url) => {
  // URL pattern: /Card/{encoded_account_id} or /Card/{encoded_account_id}/DownloadTransactions
  const match = url.match(/\/Card\/([^/]+)/)
  if (match) {
    return match[1]
  }
  return null
}

const navigate_to_card = async (page) => {
  log('Looking for credit card account link on dashboard')
  const clickables = page.locator('a, button, [role="button"], [role="link"]')
  const count = await clickables.count()

  // Log dashboard elements
  for (let i = 0; i < Math.min(count, 30); i++) {
    const el = clickables.nth(i)
    const text = ((await el.textContent()) || '').trim().replace(/\s+/g, ' ').substring(0, 80)
    const href = (await el.getAttribute('href')) || ''
    if (text && text.length > 1) {
      log('  [%d] "%s" href="%s"', i, text, href.substring(0, 60))
    }
  }

  // Find "View Account" buttons and identify which account they belong to
  const view_account_indices = []
  for (let i = 0; i < count; i++) {
    const el = clickables.nth(i)
    const text = ((await el.textContent()) || '').trim().toLowerCase()
    if (text === 'view account') {
      view_account_indices.push(i)
    }
  }

  // Get text of element before each "View Account" to identify account type
  for (const idx of view_account_indices) {
    if (idx > 0) {
      const prev = clickables.nth(idx - 1)
      const prev_text = ((await prev.textContent()) || '').trim().toLowerCase()
      if (prev_text.includes('checking') || prev_text.includes('savings') || prev_text.includes('money market')) {
        log('Skipping non-card account: "%s"', prev_text)
        continue
      }
      const display = ((await prev.textContent()) || '').trim().replace(/\s+/g, ' ').substring(0, 60)
      log('Found credit card: "%s" -- clicking View Account', display)
      await clickables.nth(idx).click()
      await wait(DIALOG_WAIT_TIME * 3)
      log('After card click, URL: %s', page.url())
      return true
    }
  }

  // Fallback: click any element with card number pattern
  for (let i = 0; i < count; i++) {
    const el = clickables.nth(i)
    const text = ((await el.textContent()) || '').trim()
    if (/\.\.\.\d{4}/.test(text) && !text.toLowerCase().includes('checking')) {
      log('Clicking card element: "%s"', text)
      await el.click()
      await wait(DIALOG_WAIT_TIME * 3)
      return true
    }
  }

  return false
}

const dismiss_overlays = async (page) => {
  // Dismiss CDK overlay backdrop if present
  const overlay = page.locator('.cdk-overlay-backdrop')
  if (await overlay.count()) {
    log('CDK overlay detected -- clicking to dismiss')
    await overlay.click({ force: true })
    await wait(1000)
  }

  // Close any popups/modals
  const close_btns = page.locator('[aria-label*="close" i], [aria-label*="dismiss" i], button:has-text("Not now"), button:has-text("Close"), button:has-text("Got it"), button:has-text("No thanks")')
  const close_count = await close_btns.count()
  for (let i = 0; i < close_count; i++) {
    const btn = close_btns.nth(i)
    if (await btn.isVisible()) {
      const text = ((await btn.textContent()) || '').trim()
      log('Dismissing overlay: "%s"', text)
      await btn.click({ force: true })
      await wait(1000)
    }
  }
}

const capture_tokens_from_requests = (page) => {
  const tokens = { bus_evt_id: null, evt_synch_token: null }

  page.on('request', (request) => {
    const url = request.url()

    // Capture tokens from URL parameters
    const bus_match = url.match(/BUS_EVT_ID=(\d+)/)
    if (bus_match) {
      tokens.bus_evt_id = bus_match[1]
      log('Captured BUS_EVT_ID from request: %s', tokens.bus_evt_id)
    }

    const evt_match = url.match(/EVT_SYNCH_TOKEN=(\d+)/)
    if (evt_match) {
      tokens.evt_synch_token = evt_match[1]
      log('Captured EVT_SYNCH_TOKEN from request: %s', tokens.evt_synch_token)
    }
  })

  page.on('response', async (response) => {
    const url = response.url()
    if (!url.includes('/credit-cards/')) return

    try {
      const text = await response.text()
      // Try to extract tokens from JSON responses
      const bus_match = text.match(/"BUS_EVT_ID"\s*:\s*"?(\d+)"?/)
      if (bus_match) {
        tokens.bus_evt_id = bus_match[1]
        log('Captured BUS_EVT_ID from response: %s', tokens.bus_evt_id)
      }
      const evt_match = text.match(/"EVT_SYNCH_TOKEN"\s*:\s*"?(\d+)"?/)
      if (evt_match) {
        tokens.evt_synch_token = evt_match[1]
        log('Captured EVT_SYNCH_TOKEN from response: %s', tokens.evt_synch_token)
      }
    } catch {
      // Response may not be text
    }
  })

  return tokens
}

const download_via_api = async ({ page, account_id, from_date, to_date, tokens }) => {
  const encoded_id = encodeURIComponent(account_id)

  // Build download URL matching the Capital One SPA pattern
  const params = new URLSearchParams({
    fromTransactionDate: from_date,
    toTransactionDate: to_date,
    documentFormatType: 'application/csv',
    acceptLanguage: 'en-US',
    'X-User-Action': 'ease.downloadTransactions'
  })

  // Add CSRF-like tokens if captured
  if (tokens.bus_evt_id) {
    params.set('BUS_EVT_ID', tokens.bus_evt_id)
  }
  if (tokens.evt_synch_token) {
    params.set('EVT_SYNCH_TOKEN', tokens.evt_synch_token)
  }

  const url = `${API_BASE}/accounts/${encoded_id}/transactions/download?${params.toString()}`
  log('Downloading via API: %s', url)

  const result = await page.evaluate(async (fetch_url) => {
    try {
      const res = await fetch(fetch_url, {
        headers: {
          'accept': 'application/json;v=1',
          'accept-language': 'en-US'
        }
      })
      const content_type = res.headers.get('content-type') || ''
      const body = await res.text()
      return { status: res.status, body, content_type }
    } catch (err) {
      return { status: 0, body: '', error: err.message }
    }
  }, url)

  log('API response: status=%d, content_type=%s, length=%d', result.status, result.content_type, result.body.length)

  if (result.status === 200 && result.body.length > 0) {
    // Verify it looks like CSV data
    if (result.body.includes('Transaction Date') || result.body.includes('Posted Date') ||
        result.body.includes('Date,') || (result.body.includes(',') && result.body.includes('\n'))) {
      log('API returned CSV data (%d bytes)', result.body.length)
      return result.body
    }
    log('API response does not look like CSV: %s', result.body.substring(0, 300))
  }

  if (result.error) {
    log('API fetch error: %s', result.error)
  }

  return null
}

const navigate_to_download_page = async (page) => {
  // Click "Download Transactions" link in the extensibility bar via JavaScript
  // The link is in a hidden/collapsed container and cannot be clicked normally
  const download_selectors = [
    '[data-e2e*="extensibility-bar-link"] >> text=/download/i',
    '.c1-ease-extensibility-bar__item >> text=/download/i'
  ]

  for (const sel of download_selectors) {
    const locator = page.locator(sel).first()
    try {
      if (await locator.count()) {
        log('Found download link: %s', sel)
        await locator.evaluate((el) => {
          const anchor = el.closest('a') || el.closest('[role="button"]') || el
          anchor.click()
        })
        await wait(DIALOG_WAIT_TIME * 2)
        log('After download link click, URL: %s', page.url())
        return true
      }
    } catch {
      continue
    }
  }

  // Fallback: scan all elements
  const all_elements = page.locator('a, button, [role="button"], [data-e2e]')
  const count = await all_elements.count()
  for (let i = 0; i < Math.min(count, 150); i++) {
    const el = all_elements.nth(i)
    const text = ((await el.textContent()) || '').trim().toLowerCase()
    const e2e = (await el.getAttribute('data-e2e')) || ''
    if (text.includes('download') && (text.includes('transaction') || e2e.includes('extensibility'))) {
      log('Found download element via scan: "%s" data-e2e="%s"', text, e2e)
      await el.evaluate((el) => {
        const anchor = el.closest('a') || el
        anchor.click()
      })
      await wait(DIALOG_WAIT_TIME * 2)
      return true
    }
  }

  return false
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
    throw new Error('Capital One credentials (username, password) are required')
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

  // Set up token capture early
  const tokens = capture_tokens_from_requests(page)

  try {
    let authenticated = await attempt_login({ page, credentials })

    if (!authenticated) {
      authenticated = await wait_for_authentication(page)
    }

    if (!authenticated) {
      throw new Error('Authentication timeout -- could not reach Capital One dashboard')
    }

    log('Authenticated successfully')
    log('Post-login URL: %s', page.url())
    await wait(DIALOG_WAIT_TIME * 3)

    // Navigate to credit card account
    const found_card = await navigate_to_card(page)
    if (!found_card) {
      throw new Error('Credit card account not found on Capital One dashboard')
    }

    // Extract account ID from card page URL
    const account_id = extract_account_id(page.url())
    if (!account_id) {
      throw new Error('Could not extract account ID from URL: ' + page.url())
    }
    log('Account ID: %s', account_id)

    // Dismiss any overlays on the card page
    await dismiss_overlays(page)

    // Navigate to download page to trigger token-bearing API calls
    // The SPA makes valid-download-dates and valid-download-file-types calls
    // which may contain the CSRF tokens we need
    const navigated = await navigate_to_download_page(page)
    if (navigated) {
      log('Navigated to download page, waiting for API calls to capture tokens...')
      await wait(DIALOG_WAIT_TIME)
    }

    // Try API-based download (primary strategy)
    log('Attempting API-based download')
    const csv_data = await download_via_api({
      page,
      account_id,
      from_date,
      to_date,
      tokens
    })

    if (!csv_data) {
      // Try without tokens (they may not be required)
      log('API download with tokens failed, trying without tokens')
      const csv_data_no_tokens = await download_via_api({
        page,
        account_id,
        from_date,
        to_date,
        tokens: {}
      })

      if (!csv_data_no_tokens) {
        throw new Error('API-based download failed -- no CSV data received')
      }

      const target_filename = create_target_filename(from_date, to_date)
      const target_path = path.join(download_dir, target_filename)
      fs.writeFileSync(target_path, csv_data_no_tokens)
      log('Saved %s (%d bytes)', target_filename, csv_data_no_tokens.length)
      return target_filename
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
