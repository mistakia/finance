import debug from 'debug'
import fs from 'fs'
import path from 'path'
import os from 'os'

import { launch_persistent_context, create_page, wait } from './stealth-browser.mjs'

const log = debug('chase')

const DOWNLOAD_TIMEOUT = 30000
const DOWNLOAD_CHECK_INTERVAL = 1000
const DIALOG_WAIT_TIME = 3000
const AUTH_WAIT_TIMEOUT = 180000

const DOWNLOADED_FILE_NAME_PATTERN = /^Chase\d+_Activity.*\.csv$/i

const DEFAULT_PROFILE_DIR = path.join(os.homedir(), '.chase-stealth-profile')

const create_target_filename = (from_date, to_date) => {
  return `chase_credit_card_${from_date}_to_${to_date}.csv`
}

const is_authenticated = (url) => {
  return (
    url.includes('/web/auth/dashboard') ||
    url.includes('/account/activity') ||
    url.includes('/web/auth/')
  )
}

const attempt_login = async ({ page, credentials }) => {
  log('Attempting login via www.chase.com homepage')

  await page.goto('https://www.chase.com/', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  })
  await wait(DIALOG_WAIT_TIME)

  if (is_authenticated(page.url())) {
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

  if (is_authenticated(page.url())) {
    return true
  }

  // May need 2FA -- return false to trigger manual wait
  return false
}

const wait_for_authentication = async (page) => {
  log('Waiting for manual authentication -- complete login/2FA in the browser window')
  const auth_start = Date.now()
  while (Date.now() - auth_start < AUTH_WAIT_TIMEOUT) {
    if (is_authenticated(page.url())) {
      return true
    }
    await wait(DIALOG_WAIT_TIME)
  }
  return false
}

const navigate_to_activity = async (page) => {
  log('Waiting for dashboard to load')
  await wait(DIALOG_WAIT_TIME * 3)

  // Look for credit card account link on the dashboard
  log('Looking for credit card account on dashboard')
  try {
    const account_links = page.locator('a')
    const count = await account_links.count()
    for (let i = 0; i < count; i++) {
      const link = account_links.nth(i)
      const text = (await link.textContent()) || ''
      const href = (await link.getAttribute('href')) || ''
      const lower_text = text.trim().toLowerCase()
      if (
        lower_text.includes('credit card') ||
        lower_text.includes('freedom') ||
        lower_text.includes('sapphire') ||
        href.includes('activity')
      ) {
        log(`Found account link: "${text.trim()}" href="${href}"`)
        await link.click()
        await wait(DIALOG_WAIT_TIME * 3)
        return true
      }
    }
  } catch (err) {
    log(`Could not find account link: ${err.message}`)
  }

  return false
}

const trigger_download = async (page) => {
  // Look for download functionality via various selectors
  const download_selectors = [
    'a[data-testid="download-activity"]',
    'a[href*="download"]',
    'button[aria-label*="Download"]',
    'button[aria-label*="download"]',
    '[data-testid*="download"]'
  ]

  log('Looking for download functionality')
  for (const selector of download_selectors) {
    const el = page.locator(selector).first()
    if (await el.count()) {
      log(`Found download element: ${selector}`)
      await el.click()
      await wait(DIALOG_WAIT_TIME)
      return true
    }
  }

  // Fallback: search by text content
  const links_and_buttons = page.locator('a, button')
  const count = await links_and_buttons.count()
  for (let i = 0; i < count; i++) {
    const el = links_and_buttons.nth(i)
    const text = (await el.textContent()) || ''
    if (text.trim().toLowerCase().includes('download')) {
      log(`Found download element via text: "${text.trim()}"`)
      await el.click()
      await wait(DIALOG_WAIT_TIME)
      return true
    }
  }

  return false
}

const select_date_range = async (page) => {
  try {
    const date_select = page.locator('#select-downloadActivityOptionId')
    if (await date_select.count()) {
      await date_select.selectOption('DATE_RANGE')
      log('Selected custom date range')
      await wait(DOWNLOAD_CHECK_INTERVAL)
    }
  } catch {
    log('No date range selector found')
  }
}

const click_download_button = async (page) => {
  const selectors = [
    '#download',
    '[data-testid*="download-submit"]',
    'button[type="submit"]'
  ]

  for (const selector of selectors) {
    const el = page.locator(selector).first()
    if (await el.count()) {
      // Use Playwright download event to capture the file
      const download_promise = page.waitForEvent('download', { timeout: DOWNLOAD_TIMEOUT }).catch(() => null)
      await el.click()
      log('Clicked download button')
      return download_promise
    }
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

    // Navigate to credit card activity
    await navigate_to_activity(page)

    // Trigger download flow
    await trigger_download(page)
    await select_date_range(page)

    // Click download and capture via Playwright download event
    const download_promise = await click_download_button(page)

    let target_filename = create_target_filename(from_date, to_date)
    const target_path = path.join(download_dir, target_filename)

    if (download_promise) {
      const download = await download_promise
      if (download) {
        await download.saveAs(target_path)
        log(`Saved download as ${target_filename}`)
        return target_filename
      }
    }

    // Fallback: check filesystem for downloaded file
    const start_time = Date.now()
    while (Date.now() - start_time < DOWNLOAD_TIMEOUT) {
      const files = fs.readdirSync(download_dir)
      const csv_files = files
        .filter(
          (file) =>
            DOWNLOADED_FILE_NAME_PATTERN.test(file) ||
            (file.endsWith('.csv') && file.startsWith('Chase'))
        )
        .map((file) => ({
          name: file,
          created: fs.statSync(path.join(download_dir, file)).birthtime
        }))
        .sort((a, b) => b.created - a.created)

      if (csv_files.length > 0) {
        const downloaded_file = csv_files[0].name
        const downloaded_path = path.join(download_dir, downloaded_file)
        fs.renameSync(downloaded_path, target_path)
        log(`Renamed ${downloaded_file} to ${target_filename}`)
        return target_filename
      }

      await wait(DOWNLOAD_CHECK_INTERVAL)
    }

    throw new Error('Downloaded file not found after waiting. Manual download may be required.')
  } finally {
    await context.close()
    log('Browser closed')
  }
}
