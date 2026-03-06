import debug from 'debug'
import fs from 'fs'
import path from 'path'
import os from 'os'

import { launch_persistent_context, create_page, wait } from './stealth-browser.mjs'

const log = debug('capital-one')

const DIALOG_WAIT_TIME = 3000
const AUTH_WAIT_TIMEOUT = 180000
const DOWNLOAD_TIMEOUT = 30000
const DOWNLOAD_CHECK_INTERVAL = 1000

const DEFAULT_PROFILE_DIR = path.join(os.homedir(), '.capital-one-stealth-profile')

const DOWNLOADED_FILE_NAME_PATTERN = /^transaction.*\.csv$/i

const create_target_filename = (from_date, to_date) => {
  return `capital_one_credit_card_${from_date}_to_${to_date}.csv`
}

const wait_for_csv_file = async (download_dir, timeout) => {
  const start_time = Date.now()
  while (Date.now() - start_time < timeout) {
    const files = fs.readdirSync(download_dir)
    const csv_files = files
      .filter(
        (file) =>
          DOWNLOADED_FILE_NAME_PATTERN.test(file) ||
          (file.endsWith('.csv') && !file.endsWith('.crdownload'))
      )
      .map((file) => ({
        name: file,
        created: fs.statSync(path.join(download_dir, file)).birthtime
      }))
      .sort((a, b) => b.created - a.created)

    if (csv_files.length > 0) {
      return csv_files[0].name
    }

    await wait(DOWNLOAD_CHECK_INTERVAL)
  }
  return null
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

  try {
    let authenticated = await attempt_login({ page, credentials })

    if (!authenticated) {
      authenticated = await wait_for_authentication(page)
    }

    if (!authenticated) {
      throw new Error('Authentication timeout -- could not reach Capital One dashboard')
    }

    log('Authenticated successfully')

    // Wait on the post-login page and let the SPA fully initialize
    log('Post-login URL: %s', page.url())
    await wait(DIALOG_WAIT_TIME * 3)

    let el_count = await page.locator('a, button, [role="button"]').count()
    log('Post-login page has %d clickable elements', el_count)

    // Navigate to transactions by clicking through the dashboard SPA
    // Direct URL navigation to /Card/transactions doesn't render the SPA content
    log('Looking for credit card account link on dashboard')
    const clickables = page.locator('a, button, [role="button"], [role="link"]')
    const count = await clickables.count()

    // Log dashboard elements to find account links
    for (let i = 0; i < Math.min(count, 30); i++) {
      const el = clickables.nth(i)
      const text = ((await el.textContent()) || '').trim().replace(/\s+/g, ' ').substring(0, 80)
      const href = (await el.getAttribute('href')) || ''
      if (text && text.length > 1) {
        log('  [%d] "%s" href="%s"', i, text, href.substring(0, 60))
      }
    }

    // Find credit card account on dashboard
    // Dashboard shows accounts with "View Account" buttons next to each
    // Checking accounts show "Simply Checking", credit cards show card number ending
    // Strategy: find a card-number-like element (ending in ...XXXX) that's NOT a checking account,
    // then click its adjacent "View Account" button
    let found_card = false

    // First pass: look for "View Account" buttons and determine which account they belong to
    const view_account_indices = []
    for (let i = 0; i < count; i++) {
      const el = clickables.nth(i)
      const text = ((await el.textContent()) || '').trim().toLowerCase()
      if (text === 'view account') {
        view_account_indices.push(i)
      }
    }

    // Get text of element before each "View Account" to identify the account type
    for (const idx of view_account_indices) {
      if (idx > 0) {
        const prev = clickables.nth(idx - 1)
        const prev_text = ((await prev.textContent()) || '').trim().toLowerCase()
        // Skip checking accounts
        if (prev_text.includes('checking') || prev_text.includes('savings') || prev_text.includes('money market')) {
          log('Skipping non-card account: "%s"', prev_text)
          continue
        }
        // This is likely a credit card
        const display = ((await prev.textContent()) || '').trim().replace(/\s+/g, ' ').substring(0, 60)
        log('Found credit card: "%s" -- clicking View Account', display)
        await clickables.nth(idx).click()
        await wait(DIALOG_WAIT_TIME * 3)
        log('After card click, URL: %s', page.url())
        found_card = true
        break
      }
    }

    if (!found_card) {
      // Fallback: click any element with card number pattern
      for (let i = 0; i < count; i++) {
        const el = clickables.nth(i)
        const text = ((await el.textContent()) || '').trim()
        if (/\.\.\.\d{4}/.test(text) && !text.toLowerCase().includes('checking')) {
          log('Clicking card element: "%s"', text)
          await el.click()
          await wait(DIALOG_WAIT_TIME * 3)
          found_card = true
          break
        }
      }
    }

    if (!found_card) {
      log('Could not find credit card account on dashboard')
      throw new Error('Credit card account not found on Capital One dashboard')
    }

    // Now on card overview page -- dismiss any overlays (CDK overlay backdrop)
    el_count = await page.locator('a, button, [role="button"]').count()
    log('Card page has %d elements, URL: %s', el_count, page.url())

    // Dismiss overlay if present
    const overlay = page.locator('.cdk-overlay-backdrop')
    if (await overlay.count()) {
      log('CDK overlay detected -- clicking to dismiss')
      await overlay.click({ force: true })
      await wait(1000)
    }

    // Also try closing any popups/modals
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

    // Click "Payments & expenses" or "Transactions" tab
    const tab_patterns = ['payment', 'expense', 'transaction', 'activity', 'statement']
    const tabs = page.locator('a, button, [role="tab"]')
    const tab_count = await tabs.count()
    for (let i = 0; i < tab_count; i++) {
      const tab = tabs.nth(i)
      const text = ((await tab.textContent()) || '').trim().toLowerCase()
      if (tab_patterns.some((p) => text.includes(p))) {
        log('Clicking tab: "%s"', text)
        await tab.click({ timeout: 15000 })
        await wait(DIALOG_WAIT_TIME * 2)
        log('After tab click, URL: %s', page.url())
        break
      }
    }

    // Wait for the transactions page SPA to render
    log('Waiting for transactions SPA to render...')
    for (let poll = 0; poll < 10; poll++) {
      await wait(DIALOG_WAIT_TIME)
      el_count = await page.locator('a, button, [role="button"]').count()
      log('Poll %d: %d elements, URL: %s', poll + 1, el_count, page.url())
      if (el_count > 30) break
    }

    // Look for download link/button
    log('Looking for download control on transactions page (URL: %s)', page.url())

    const download_selectors = [
      '[data-testid="download-transactions"]',
      'a[href*="download"]',
      'button[aria-label*="download" i]',
      'a[aria-label*="download" i]',
      '[data-testid*="download"]'
    ]

    let download_el = null
    for (const sel of download_selectors) {
      const locator = page.locator(sel).first()
      if (await locator.count()) {
        download_el = locator
        log('Found download control: %s', sel)
        break
      }
    }

    if (!download_el) {
      // Scan all clickable elements for download-related text/attributes
      const clickables = page.locator('a, button, [role="button"]')
      const count = await clickables.count()
      log('Scanning %d clickable elements for download...', count)
      for (let i = 0; i < Math.min(count, 100); i++) {
        const el = clickables.nth(i)
        const text = ((await el.textContent()) || '').trim().replace(/\s+/g, ' ').substring(0, 80)
        const aria = (await el.getAttribute('aria-label')) || ''
        const href = (await el.getAttribute('href')) || ''
        const testid = (await el.getAttribute('data-testid')) || ''
        if (text.toLowerCase().includes('download') || aria.toLowerCase().includes('download') ||
            href.includes('download') || testid.includes('download')) {
          log('  Found candidate [%d]: text="%s" aria="%s" href="%s" testid="%s"', i, text, aria, href, testid)
          download_el = el
          break
        }
      }
    }

    if (!download_el) {
      log('No download control found on transactions page')
      // Log page URL and a sample of elements for debugging
      const all_btns = page.locator('a, button')
      const btn_count = await all_btns.count()
      log('Page has %d links/buttons, first 15:', btn_count)
      for (let i = 0; i < Math.min(btn_count, 15); i++) {
        const text = ((await all_btns.nth(i).textContent()) || '').trim().replace(/\s+/g, ' ').substring(0, 60)
        if (text) log('  "%s"', text)
      }
      throw new Error('Download control not found on Capital One transactions page')
    }

    await download_el.click()
    log('Clicked download control')
    await wait(DIALOG_WAIT_TIME)

    // Select CSV format if format selector exists
    const format_select = page.locator('#format-select, select[name*="format"]')
    if (await format_select.count()) {
      await format_select.selectOption('csv')
      log('Selected CSV format')
      await wait(1000)
    } else {
      log('No format selector found, proceeding with default')
    }

    // Select date range if selector exists
    const date_range_select = page.locator('#date-range-select, select[name*="date"]')
    if (await date_range_select.count()) {
      // Try to select a broad range option
      const options = await date_range_select.evaluate((el) =>
        Array.from(el.options).map((o) => ({ value: o.value, text: o.text.trim() }))
      )
      log('Date range options: %O', options)

      const custom_opt = options.find((o) => /custom|all|year/i.test(o.value + o.text))
      if (custom_opt) {
        await date_range_select.selectOption(custom_opt.value)
        log('Selected date range: %s', custom_opt.text)
      }
      await wait(1000)
    } else {
      log('No date range selector found, proceeding with default range')
    }

    // Click download submit button
    const submit = page.locator('[data-testid="download-submit"], button:has-text("Download"), button[type="submit"]').first()
    if (await submit.count()) {
      log('Clicking download submit')
      await submit.click()
    }

    // Wait for the CSV file to appear
    log('Waiting for CSV file download...')
    const downloaded_file = await wait_for_csv_file(download_dir, DOWNLOAD_TIMEOUT)

    if (!downloaded_file) {
      throw new Error('Downloaded file not found after waiting')
    }

    // Rename to structured filename
    const target_filename = create_target_filename(from_date, to_date)
    const downloaded_path = path.join(download_dir, downloaded_file)
    const target_path = path.join(download_dir, target_filename)

    fs.renameSync(downloaded_path, target_path)
    log('Renamed %s to %s', downloaded_file, target_filename)

    return target_filename
  } finally {
    await context.close()
    log('Browser closed')
  }
}
