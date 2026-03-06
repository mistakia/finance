import debug from 'debug'
import fs from 'fs'
import path from 'path'
import os from 'os'

import { launch_persistent_context, create_page, wait } from './stealth-browser.mjs'

const log = debug('american-express')

const DIALOG_WAIT_TIME = 3000
const AUTH_WAIT_TIMEOUT = 180000
const DOWNLOAD_TIMEOUT = 30000
const DOWNLOAD_CHECK_INTERVAL = 1000

const DEFAULT_PROFILE_DIR = path.join(os.homedir(), '.amex-stealth-profile')

const DOWNLOADED_FILE_NAME_PATTERN = /^ofx.*\.csv$|^activity.*\.csv$/i

const create_target_filename = (from_date, to_date) => {
  return `american_express_card_${from_date}_to_${to_date}.csv`
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

    // Navigate directly to activity download page
    log('Navigating to activity download page')
    await page.goto('https://global.americanexpress.com/activity/download', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    })
    await wait(DIALOG_WAIT_TIME * 2)

    // Select CSV format
    const format_select = page.locator('#selectfiletype, select[name*="format"]')
    if (await format_select.count()) {
      const options = await format_select.evaluate((el) =>
        Array.from(el.options).map((o) => ({ value: o.value, text: o.text.trim() }))
      )
      log('Format options: %O', options)

      const csv_opt = options.find((o) => /csv/i.test(o.value + o.text))
      if (csv_opt) {
        await format_select.selectOption(csv_opt.value)
        log('Selected CSV format')
      }
      await wait(1000)
    } else {
      log('No format selector found, proceeding with default')
    }

    // Select date range/period
    const period_select = page.locator('#selectperiod, select[name*="period"], select[name*="date"]')
    if (await period_select.count()) {
      const options = await period_select.evaluate((el) =>
        Array.from(el.options).map((o) => ({ value: o.value, text: o.text.trim() }))
      )
      log('Period options: %O', options)

      // Prefer YTD or custom range
      const target = options.find((o) => /year.*date|ytd|custom|all/i.test(o.value + o.text))
      if (target) {
        await period_select.selectOption(target.value)
        log('Selected period: %s', target.text)
      }
      await wait(1000)
    } else {
      log('No period selector found, proceeding with default range')
    }

    // Click download button
    const submit = page.locator('#btnDownload, button:has-text("Download"), [data-testid="download-submit"]').first()
    if (await submit.count()) {
      log('Clicking download button')
      await submit.click()
    } else {
      log('No download button found')
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
