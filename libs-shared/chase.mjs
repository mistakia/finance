import debug from 'debug'
import fs from 'fs'
import path from 'path'
import os from 'os'

import { launch_persistent_context, create_page, wait } from './stealth-browser.mjs'

const log = debug('chase')

const DIALOG_WAIT_TIME = 3000
const AUTH_WAIT_TIMEOUT = 300000

const DEFAULT_PROFILE_DIR = path.join(os.homedir(), '.chase-stealth-profile')

const DOWNLOAD_OPTIONS_URL = '/svc/rr/accounts/secure/v1/account/activity/download/options/list'

const create_target_filename = (from_date, to_date, account_index = 0) => {
  const suffix = account_index > 0 ? `_${account_index}` : ''
  return `chase_credit_card_${from_date}_to_${to_date}${suffix}.csv`
}

const is_on_2fa_page = async (page) => {
  try {
    const body_text = await page.locator('body').textContent()
    const lower = (body_text || '').toLowerCase()
    return (
      lower.includes("let's make sure it's you") ||
      lower.includes('confirm your identity') ||
      lower.includes('confirm identity') ||
      lower.includes('verification code') ||
      lower.includes('one-time code')
    )
  } catch {
    return false
  }
}

const is_authenticated = async (page) => {
  const url = page.url()

  // Must be on a secure post-login page, NOT the login/nav flow
  // /web/auth/nav is the login flow (includes 2FA, logon pages)
  // /web/auth/dashboard is the authenticated dashboard
  const on_authenticated_page =
    url.includes('/web/auth/dashboard') ||
    url.includes('/account/activity')

  if (!on_authenticated_page) {
    return false
  }

  if (await is_on_2fa_page(page)) {
    return false
  }

  return true
}

const attempt_login = async ({ page, credentials }) => {
  log('Attempting login via www.chase.com homepage')

  await page.goto('https://www.chase.com/', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  })
  await wait(DIALOG_WAIT_TIME)

  if (await is_authenticated(page)) {
    log('Already authenticated via session cookies')
    return true
  }

  if (page.url().includes('system-requirements')) {
    log('Redirected to system requirements -- bot detected')
    return false
  }

  // Find and fill the login form on the homepage
  const username_locator = page.locator('#userId-text-input-field')
  try {
    await username_locator.waitFor({ timeout: 15000 })
  } catch {
    log('No login form found on homepage')
    return false
  }

  await username_locator.fill(credentials.username)
  await wait(1000)

  const password_locator = page.locator('#password-text-input-field')
  await password_locator.fill(credentials.password)
  await wait(1000)

  const signin_button = page.locator('#signin-button')
  await signin_button.click()
  log('Submitted login form')

  // Wait for navigation after login
  try {
    await page.waitForURL(/secure.*chase\.com/, { timeout: 60000 })
  } catch {
    log('Navigation timeout after login submit')
  }

  await wait(DIALOG_WAIT_TIME)

  if (await is_authenticated(page)) {
    return true
  }

  // 2FA or other verification needed -- return false to trigger manual wait
  if (await is_on_2fa_page(page)) {
    log('2FA required -- complete verification in the browser window')
  }
  return false
}

const wait_for_authentication = async (page) => {
  log('Waiting for manual authentication -- complete login/2FA in the browser window (up to 3 minutes)')
  const auth_start = Date.now()
  let last_url = ''
  while (Date.now() - auth_start < AUTH_WAIT_TIMEOUT) {
    const current_url = page.url()
    if (current_url !== last_url) {
      log('URL changed: %s', current_url)
      last_url = current_url
    }

    const on_2fa = await is_on_2fa_page(page)
    if (!on_2fa && (
      current_url.includes('/web/auth/dashboard') ||
      current_url.includes('/account/activity')
    )) {
      log('Authentication detected (URL: %s, 2FA: %s)', current_url, on_2fa)
      return true
    }

    await wait(DIALOG_WAIT_TIME)
  }
  log('Authentication timeout. Last URL: %s', page.url())
  return false
}

// --- API-based download (primary strategy) ---

const extract_credit_card_accounts = (options_data) => {
  // Response structure: { downloadAccountActivityOptions: [{ accountId, nickName, mask, summaryType }] }
  const options = options_data.downloadAccountActivityOptions || []
  return options.map((opt) => ({
    id: String(opt.accountId),
    name: opt.nickName || `****${opt.mask || ''}`,
    type: (opt.summaryType || opt.detailType || '').toLowerCase()
  }))
}

const format_date_yyyymmdd = (date_str) => date_str.replace(/-/g, '')

const find_clickable_by_text = async (page, patterns, selector = 'a, button, [role="button"], [role="link"]') => {
  const clickables = page.locator(selector)
  const count = await clickables.count()
  for (let i = 0; i < Math.min(count, 150); i++) {
    const el = clickables.nth(i)
    const text = ((await el.textContent()) || '').trim().toLowerCase()
    const aria = ((await el.getAttribute('aria-label')) || '').toLowerCase()
    for (const pattern of patterns) {
      if (text.includes(pattern) || aria.includes(pattern)) {
        return el
      }
    }
  }
  return null
}

const find_download_button = async (page) => {
  // Chase's download button is an icon-only button with aria-label containing "download"
  // Must avoid matching text inside modals/overlays that mention "download"
  const candidates = page.locator('a, button, [role="button"], [role="link"], [role="menuitem"]')
  const count = await candidates.count()
  const matches = []

  for (let i = 0; i < Math.min(count, 150); i++) {
    const el = candidates.nth(i)
    const aria = ((await el.getAttribute('aria-label')) || '').toLowerCase()
    const text = ((await el.textContent()) || '').trim().replace(/\s+/g, ' ')
    const tag = await el.evaluate((e) => e.tagName.toLowerCase())

    // Prefer aria-label match on compact elements (icon buttons)
    if (aria.includes('download')) {
      // Check if this is a compact icon button (short or empty text)
      const is_icon = text.length < 20
      matches.push({ el, aria, text, tag, is_icon, index: i })
    }
  }

  log('Download button candidates: %d', matches.length)
  for (const m of matches) {
    log('  [%s] text="%s" aria="%s" icon=%s', m.tag, m.text.substring(0, 50), m.aria, m.is_icon)
  }

  // Prefer icon buttons (short text with aria-label) over text links
  const icon_match = matches.find((m) => m.is_icon)
  return icon_match ? icon_match.el : (matches[0] ? matches[0].el : null)
}

const dismiss_modals = async (page) => {
  // Dismiss any overlay modals that might interfere with the download button
  const close_buttons = page.locator('[aria-label*="close" i], [aria-label*="dismiss" i], [aria-label*="got it" i], button:has-text("Got it"), button:has-text("Close"), button:has-text("OK")')
  const count = await close_buttons.count()
  for (let i = 0; i < count; i++) {
    const btn = close_buttons.nth(i)
    if (await btn.isVisible()) {
      const text = ((await btn.textContent()) || '').trim()
      log('Dismissing modal/overlay: "%s"', text)
      await btn.click()
      await wait(1000)
    }
  }
}

const navigate_to_activity_page = async (page) => {
  log('Waiting for dashboard to render')
  await wait(DIALOG_WAIT_TIME * 2)

  log('Looking for activity/transactions link on dashboard')

  // Try specific "See all transactions" first, then broader matches
  const patterns = [
    ['see all transactions'],
    ['activity', 'transactions']
  ]

  for (const pattern_group of patterns) {
    const el = await find_clickable_by_text(page, pattern_group)
    if (el) {
      const text = ((await el.textContent()) || '').trim()
      log('Clicking: "%s"', text)
      await el.click()
      await wait(DIALOG_WAIT_TIME * 3)
      log('After click, URL: %s', page.url())
      return true
    }
  }

  log('Could not find activity/transactions link on dashboard')
  return false
}


const interact_with_mds_select = async (page, select_id, target_pattern) => {
  // Chase uses custom mds-select web components, not native <select> elements
  // The select button has id="select-{select_id}" and opens a menu with role="listbox"
  const button_selector = `#select-${select_id}`
  const button = page.locator(button_selector)

  if (!(await button.count())) {
    log('MDS select button not found: %s', button_selector)
    return false
  }

  const current_text = ((await button.textContent()) || '').trim()
  log('MDS select %s current value: "%s"', select_id, current_text)

  // Click to open the dropdown menu
  await button.click()
  await wait(1000)

  // Find all options in the opened listbox
  const options = page.locator(`mds-select#${select_id} [role="option"], #${select_id} [role="option"]`)
  const option_count = await options.count()
  log('MDS select %s has %d option(s)', select_id, option_count)

  const option_list = []
  for (let i = 0; i < option_count; i++) {
    const opt = options.nth(i)
    const text = ((await opt.textContent()) || '').trim().replace(/\s+/g, ' ')
    const cls = ((await opt.getAttribute('class')) || '')
    const selected = cls.includes('selected')
    option_list.push({ text, index: i, selected })
    log('  Option %d: "%s"%s', i, text, selected ? ' (selected)' : '')
  }

  // Find the target option
  if (target_pattern) {
    const target = option_list.find((o) => target_pattern.test(o.text))
    if (target) {
      log('Selecting option: "%s"', target.text)
      await options.nth(target.index).click()
      await wait(DIALOG_WAIT_TIME)
      return true
    }
    log('No option matching pattern %s', target_pattern)
  }

  // Close the dropdown if we didn't select anything
  await button.click()
  await wait(500)
  return false
}

const interact_with_download_form = async ({ page, from_date, to_date }) => {
  // Chase download form uses mds-select web components with these IDs:
  // - account-selector: Account dropdown (already correct)
  // - downloadFileTypeOption: File type (should be CSV/Spreadsheet)
  // - activitySelection (or similar): Activity/date range selection

  // Step 1: Enumerate all mds-select components on the page
  const mds_selects = page.locator('mds-select')
  const mds_count = await mds_selects.count()
  log('Found %d mds-select component(s)', mds_count)

  const select_ids = []
  for (let i = 0; i < mds_count; i++) {
    const sel = mds_selects.nth(i)
    const id = (await sel.getAttribute('id')) || ''
    const btn = sel.locator('button.mds-select__select')
    const value = btn ? ((await btn.textContent().catch(() => '')) || '').trim() : ''
    log('  mds-select #%s: "%s"', id, value)
    select_ids.push({ id, value })
  }

  // Step 2: Handle the Activity dropdown -- need to select a broader date range
  // The activity dropdown ID pattern: look for anything with "activity" or similar
  const activity_select = select_ids.find((s) =>
    /activity|date|range|period/i.test(s.id) ||
    /current display|all transaction/i.test(s.value)
  )

  if (activity_select) {
    log('Found activity selector: #%s = "%s"', activity_select.id, activity_select.value)
    // Select "Year to date" for current year requests, otherwise "All transactions"
    const current_year = new Date().getFullYear()
    const is_ytd = from_date.startsWith(`${current_year}-01-01`)
    const target = is_ytd ? /year\s*to\s*date/i : /all\s*transaction/i
    log('Activity selection strategy: %s', is_ytd ? 'Year to date' : 'All transactions')
    const selected = await interact_with_mds_select(page, activity_select.id, target)
    if (!selected) {
      // Fallback to "All transactions"
      await interact_with_mds_select(page, activity_select.id, /all\s*transaction/i)
    }
  } else {
    log('No activity/date range selector found among mds-select components')
    // Try a third mds-select that isn't account or file type
    const other = select_ids.find((s) =>
      !s.id.includes('account') && !s.id.includes('FileType') && !s.id.includes('downloadFileType')
    )
    if (other) {
      log('Trying other mds-select: #%s = "%s"', other.id, other.value)
      await interact_with_mds_select(page, other.id, /all|date|range|custom/i)
    }
  }

  // Step 3: Handle date input fields if they appeared
  const date_inputs = page.locator('input[type="date"], input[type="text"][id*="date" i], input[type="text"][name*="date" i], input[aria-label*="date" i], input[placeholder*="MM" i], mds-input[id*="date" i] input')
  const date_input_count = await date_inputs.count()
  log('Found %d date input field(s) after activity selection', date_input_count)

  if (date_input_count >= 2) {
    const from_mmddyyyy = `${from_date.slice(5, 7)}/${from_date.slice(8, 10)}/${from_date.slice(0, 4)}`
    const to_mmddyyyy = `${to_date.slice(5, 7)}/${to_date.slice(8, 10)}/${to_date.slice(0, 4)}`
    log('Filling date fields: %s to %s', from_mmddyyyy, to_mmddyyyy)

    await date_inputs.nth(0).fill(from_mmddyyyy)
    await wait(500)
    await date_inputs.nth(1).fill(to_mmddyyyy)
    await wait(500)
  }
}

const try_direct_api_download = async ({ page, accounts, from_date, to_date, csrf_token }) => {
  const start = format_date_yyyymmdd(from_date)
  const end = format_date_yyyymmdd(to_date)
  const account = accounts[0]

  log('Attempting direct API download for account %s (%s)', account.id, account.name)
  log('Date range: %s to %s, CSRF: %s', start, end, csrf_token ? csrf_token.substring(0, 8) + '...' : 'NONE')

  // The transaction-activities endpoint is a navigation/download request
  // Build the URL matching the pattern from network captures
  const base_path = '/svc/rr/accounts/secure/v1/account/activity/card/download'
  const params = new URLSearchParams({
    'end-date': end,
    'start-date': start,
    'account-activity-download-type-code': 'CSV',
    'digital-account-identifier': account.id,
    'csrftoken': csrf_token,
    'submit': 'Submit'
  })
  const url = `${base_path}/transaction-activities?${params.toString()}`

  const result = await page.evaluate(async (fetch_url) => {
    try {
      const res = await fetch(fetch_url)
      return { status: res.status, body: await res.text() }
    } catch (err) {
      return { status: 0, body: '', error: err.message }
    }
  }, url)

  log('Direct API response: status=%d, length=%d', result.status, result.body.length)

  if (result.status === 200 && result.body.length > 0) {
    // Verify it looks like CSV data
    if (result.body.includes('Transaction Date') || result.body.includes('Post Date') || result.body.includes(',')) {
      log('Direct API returned CSV data (%d bytes)', result.body.length)
      return result.body
    }
    log('Direct API response does not look like CSV: %s', result.body.substring(0, 200))
  }

  // Try the transaction-counts endpoint first to verify parameters work
  const count_params = new URLSearchParams({
    'end-date': end,
    'start-date': start,
    'account-activity-download-type-code': 'CSV',
    'digital-account-identifier': account.id
  })
  const count_url = `${base_path}/transaction-counts?${count_params.toString()}`

  const count_result = await page.evaluate(async (fetch_url) => {
    try {
      const res = await fetch(fetch_url)
      return { status: res.status, body: await res.text() }
    } catch (err) {
      return { status: 0, body: '', error: err.message }
    }
  }, count_url)

  log('Transaction count response: status=%d, body=%s', count_result.status, count_result.body.substring(0, 200))

  return null
}

const download_via_api = async ({ page, from_date, to_date, download_dir }) => {
  // Step 1: Discover accounts via API
  log('Fetching download options via API')
  const options_result = await page.evaluate(async (url) => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'x-jpmc-csrf-token': 'NONE'
        }
      })
      return { status: res.status, body: await res.text() }
    } catch (err) {
      return { status: 0, body: '', error: err.message }
    }
  }, DOWNLOAD_OPTIONS_URL)

  log('Download options status: %d', options_result.status)

  if (options_result.status !== 200) {
    log('Download options failed: %s', options_result.body.substring(0, 300))
    return null
  }

  let options_data
  try {
    options_data = JSON.parse(options_result.body)
  } catch {
    log('Could not parse download options response')
    return null
  }

  const accounts = extract_credit_card_accounts(options_data)
  log('Found %d account(s): %O', accounts.length, accounts)

  if (!accounts.length) {
    log('No accounts found in download options')
    return null
  }

  // Step 2: Set up CSRF token capture from all SPA requests
  let csrf_token = null
  const capture_csrf = (request) => {
    const url = request.url()
    // Check URL query parameters
    const csrf_match = url.match(/csrftoken=([^&]+)/)
    if (csrf_match) {
      csrf_token = csrf_match[1]
      log('Captured CSRF from request URL: %s...', csrf_token.substring(0, 12))
    }
    // Check request headers
    const headers = request.headers()
    const header_csrf = headers['x-jpmc-csrf-token']
    if (header_csrf && header_csrf !== 'NONE') {
      csrf_token = header_csrf
      log('Captured CSRF from request header: %s...', csrf_token.substring(0, 12))
    }
  }
  page.on('request', capture_csrf)

  // Step 3: Set up route interception to capture CSV data
  let captured_csv = null
  await page.route('**/transaction-activities**', async (route) => {
    log('Intercepted transaction-activities request: %s', route.request().url().substring(0, 200))
    const response = await route.fetch()
    const status = response.status()
    log('Intercepted response status: %d', status)

    if (status === 200) {
      const body = await response.text()
      log('Intercepted response length: %d', body.length)
      if (body.includes('Transaction Date') || body.includes('Post Date')) {
        captured_csv = body
        log('Captured CSV data (%d bytes)', body.length)
      }
    }

    await route.fulfill({ response })
  })

  const cleanup = async () => {
    page.removeListener('request', capture_csrf)
    await page.unroute('**/transaction-activities**')
  }

  // Step 4: Navigate to activity page
  const navigated = await navigate_to_activity_page(page)
  if (!navigated) {
    await cleanup()
    return null
  }

  // Wait for SPA to fully render and dismiss any overlays
  await wait(DIALOG_WAIT_TIME * 2)
  await dismiss_modals(page)

  // Step 5: Find and click the download button (icon button with aria-label)
  const download_el = await find_download_button(page)
  if (!download_el) {
    log('Could not find download button on activity page')
    log('Page URL: %s', page.url())
    await cleanup()
    return null
  }

  const dl_text = ((await download_el.textContent()) || '').trim()
  const dl_aria = ((await download_el.getAttribute('aria-label')) || '').trim()
  log('Clicking download button: text="%s" aria="%s"', dl_text, dl_aria)
  await download_el.click()
  await wait(DIALOG_WAIT_TIME * 2)

  // Step 6: Interact with the download form
  await interact_with_download_form({ page, from_date, to_date })

  // Step 7: Set up download event listener and click submit
  const download_promise = page
    .waitForEvent('download', { timeout: 30000 })
    .catch(() => null)

  // Find the "Download" submit button in the download panel
  // Chase uses mds-button web components: <mds-button id="download" variant="primary">
  const submit_selectors = [
    'mds-button#download',
    'mds-button#download button',
    'button#download',
    'button:has-text("Download")',
    'button[type="submit"]'
  ]
  let submit_clicked = false
  for (const selector of submit_selectors) {
    const btn = page.locator(selector).first()
    if (await btn.count()) {
      const tag = await btn.evaluate((e) => e.tagName.toLowerCase())
      const text = ((await btn.textContent()) || '').trim()
      const id = (await btn.getAttribute('id')) || ''
      log('Found submit candidate (%s): [%s] id="%s" text="%s"', selector, tag, id, text)
      await btn.click()
      submit_clicked = true
      break
    }
  }

  if (!submit_clicked) {
    log('No submit button found after download panel opened')
  }

  // Step 8: Wait for download event or route interception
  log('Waiting for download event...')
  const download = await download_promise

  if (download) {
    const filename = create_target_filename(from_date, to_date, 0)
    const target_path = path.join(download_dir, filename)
    await download.saveAs(target_path)
    log('Saved download as %s', filename)
    await cleanup()
    return [filename]
  }

  if (captured_csv) {
    const filename = create_target_filename(from_date, to_date, 0)
    const target_path = path.join(download_dir, filename)
    fs.writeFileSync(target_path, captured_csv, 'utf-8')
    log('Saved intercepted CSV as %s (%d bytes)', filename, captured_csv.length)
    await cleanup()
    return [filename]
  }

  // Step 9: Fallback -- try direct API call with captured CSRF token
  log('UI download did not produce CSV -- trying direct API fallback')

  // If no CSRF captured yet, try extracting from page JavaScript context
  if (!csrf_token) {
    log('No CSRF captured from requests -- attempting extraction from page JS')
    csrf_token = await page.evaluate(() => {
      // Search common SPA patterns for CSRF storage
      const meta = document.querySelector('meta[name="csrf-token"], meta[name="_csrf"]')
      if (meta) return meta.getAttribute('content')

      // Check for global variables
      for (const key of Object.keys(window)) {
        const val = window[key]
        if (typeof val === 'string' && val.length > 20 && val.length < 200 && /^[a-zA-Z0-9_-]+$/.test(val)) {
          continue // too many false positives
        }
        if (val && typeof val === 'object' && val.csrfToken) return val.csrfToken
        if (val && typeof val === 'object' && val.csrf) return val.csrf
      }

      // Check cookies
      const cookies = document.cookie.split(';')
      for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=')
        if (/csrf/i.test(name)) return value
      }

      return null
    })
    if (csrf_token) {
      log('Extracted CSRF from page context: %s...', csrf_token.substring(0, 12))
    }
  }

  if (csrf_token) {
    const csv = await try_direct_api_download({ page, accounts, from_date, to_date, csrf_token })
    if (csv) {
      const filename = create_target_filename(from_date, to_date, 0)
      const target_path = path.join(download_dir, filename)
      fs.writeFileSync(target_path, csv, 'utf-8')
      log('Saved direct API CSV as %s (%d bytes)', filename, csv.length)
      await cleanup()
      return [filename]
    }
  } else {
    log('No CSRF token available -- cannot attempt direct API download')
  }

  // Dump page state for diagnostics
  log('All download strategies failed -- dumping page state')
  const forms = page.locator('form, [role="dialog"], [class*="download"], [class*="modal"]')
  const form_count = await forms.count()
  log('Forms/dialogs on page: %d', form_count)
  for (let f = 0; f < form_count; f++) {
    const form_html = await forms.nth(f).evaluate((el) => el.outerHTML.substring(0, 500))
    log('  Form/dialog %d: %s', f, form_html)
  }

  await cleanup()
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
    throw new Error('Chase credentials (username, password) are required')
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
    let authenticated = false

    // Navigate and attempt login
    authenticated = await attempt_login({ page, credentials })

    if (!authenticated) {
      authenticated = await wait_for_authentication(page)
    }

    if (!authenticated) {
      throw new Error('Authentication timeout -- could not reach Chase dashboard')
    }

    log('Authenticated successfully')

    // Download via internal Chase APIs using authenticated session
    const downloaded_files = await download_via_api({
      page,
      from_date,
      to_date,
      download_dir
    })

    if (!downloaded_files || downloaded_files.length === 0) {
      throw new Error('API-based download failed -- no CSV files retrieved')
    }

    log('Downloaded %d file(s): %s', downloaded_files.length, downloaded_files.join(', '))
    return downloaded_files[0]
  } finally {
    await context.close()
    log('Browser closed')
  }
}
