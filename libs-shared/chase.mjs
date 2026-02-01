import debug from 'debug'
import fs from 'fs'
import path from 'path'
import puppeteer from 'puppeteer'

import { wait } from '#libs-shared'

const log = debug('chase')

// Constants for timeouts and intervals
const DOWNLOAD_TIMEOUT = 30000
const DOWNLOAD_CHECK_INTERVAL = 1000
const PAGE_LOAD_TIMEOUT = 60000
const DIALOG_WAIT_TIME = 3000
const INITIAL_PAGE_WAIT = 10000
const MOUSE_MOVE_WAIT = 1000
const AUTH_WAIT_TIMEOUT = 180000

// Constants for file handling
const DOWNLOADED_FILE_NAME_PATTERN = /^Chase\d+_Activity.*\.csv$/i

const wait_for_csv_file = async (download_dir, timeout) => {
  const start_time = Date.now()
  while (Date.now() - start_time < timeout) {
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
      return csv_files[0].name
    }

    await wait(DOWNLOAD_CHECK_INTERVAL)
  }
  return null
}

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
  log('Attempting login')

  // Try multiple login page URLs
  const login_urls = [
    'https://secure07a.chase.com/web/auth/dashboard',
    'https://www.chase.com/'
  ]

  for (const login_url of login_urls) {
    log(`Trying login URL: ${login_url}`)
    await page.goto(login_url, {
      waitUntil: 'networkidle2',
      timeout: PAGE_LOAD_TIMEOUT
    })
    await wait(DIALOG_WAIT_TIME)

    // Check if already authenticated from profile cookies
    if (is_authenticated(page.url())) {
      log('Already authenticated via session cookies')
      return true
    }

    // Check if redirected to system requirements (bot detection)
    if (page.url().includes('system-requirements')) {
      log('Redirected to system requirements page, trying next URL')
      continue
    }

    // Try to find and fill login form
    try {
      const username_input = await page.$('#userId-text-input-field')
      if (!username_input) {
        log('No login form found on this page')
        continue
      }

      await page.type('#userId-text-input-field', credentials.username)
      await page.mouse.move(800, 300)
      await wait(MOUSE_MOVE_WAIT)
      await page.type('#password-text-input-field', credentials.password)
      await wait(MOUSE_MOVE_WAIT)
      await page.click('#signin-button')
      log('Submitted login form')

      // Wait for navigation result
      try {
        await page.waitForNavigation({
          waitUntil: 'networkidle2',
          timeout: PAGE_LOAD_TIMEOUT
        })
      } catch {
        log('Navigation timeout after login submit')
      }

      if (is_authenticated(page.url())) {
        return true
      }

      if (page.url().includes('system-requirements')) {
        log('Redirected to system requirements after login')
        continue
      }

      // May need 2FA -- wait for user intervention
      return false
    } catch (err) {
      log(`Login attempt failed: ${err.message}`)
      continue
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

  log('Launching browser')
  const launch_args = [
    '--disable-blink-features=AutomationControlled',
    '--window-position=0,0'
  ]

  if (user_data_dir) {
    launch_args.push(`--user-data-dir=${user_data_dir}`)
  }

  const browser = await puppeteer.launch({
    headless: false,
    args: launch_args,
    ignoreDefaultArgs: ['--enable-automation'],
    executablePath:
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  })

  const page = await browser.newPage()
  await page.setViewport({ width: 1366, height: 768 })

  try {
    // Set download behavior
    const client = await page.createCDPSession()
    await client.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: download_dir,
      eventsEnabled: true
    })

    log('Navigating to Chase')
    await page.goto('https://secure07a.chase.com/web/auth/dashboard', {
      waitUntil: 'networkidle2',
      timeout: PAGE_LOAD_TIMEOUT
    })
    await wait(INITIAL_PAGE_WAIT)

    // Check current state -- may already be logged in via profile
    const current_url = page.url()
    log(`Current URL: ${current_url}`)

    let authenticated = is_authenticated(current_url)

    if (!authenticated) {
      authenticated = await attempt_login({ page, credentials })
    }

    if (!authenticated) {
      // Wait for manual authentication (2FA or manual login)
      log(
        'Waiting for manual authentication -- complete login in the browser window'
      )
      const auth_start = Date.now()
      while (Date.now() - auth_start < AUTH_WAIT_TIMEOUT) {
        if (is_authenticated(page.url())) {
          authenticated = true
          break
        }
        await wait(DIALOG_WAIT_TIME)
      }
    }

    if (!authenticated) {
      throw new Error(
        'Authentication timeout -- could not reach Chase dashboard'
      )
    }

    log('Authenticated successfully')

    // Wait for the SPA to fully load the dashboard
    log('Waiting for dashboard SPA to load')
    await wait(DIALOG_WAIT_TIME * 3)

    // Check for iframes (Chase uses heavy iframe architecture)
    const iframe_count = await page.evaluate(
      () => document.querySelectorAll('iframe').length
    )
    log(`Found ${iframe_count} iframes`)

    // Get all frames and look for content
    const frames = page.frames()
    log(`Total frames: ${frames.length}`)
    for (const frame of frames) {
      const frame_url = frame.url()
      if (frame_url && frame_url !== 'about:blank') {
        log(`Frame URL: ${frame_url}`)
      }
    }

    // Try clicking on the credit card account link from dashboard
    log('Looking for credit card account on dashboard')
    try {
      // Wait for account tiles to appear
      await page.waitForSelector(
        'a[data-testid], .account-tile a, mds-link, [class*="account"]',
        { timeout: 15000 }
      )

      const account_links = await page.$$('a')
      for (const link of account_links) {
        const text = await page.evaluate(
          (el) => el.textContent?.trim(),
          link
        )
        const href = await page.evaluate(
          (el) => el.getAttribute('href') || '',
          link
        )
        if (
          text &&
          (text.toLowerCase().includes('credit card') ||
            text.toLowerCase().includes('freedom') ||
            text.toLowerCase().includes('sapphire') ||
            text.toLowerCase().includes('amazon') ||
            href.includes('activity'))
        ) {
          log(`Found account link: "${text}" href="${href}"`)
          await link.click()
          await wait(DIALOG_WAIT_TIME * 3)
          break
        }
      }
    } catch (err) {
      log(`Could not find account link: ${err.message}`)
    }

    // Log current state after navigation
    const page_text_after = await page.evaluate(
      () => document.body?.innerText?.substring(0, 500) || ''
    )
    log(`Page text: ${page_text_after.substring(0, 300)}`)

    // Try to find download functionality via various selectors
    const download_selectors = [
      'a[data-testid="download-activity"]',
      'a[href*="download"]',
      'button[aria-label*="Download"]',
      'button[aria-label*="download"]',
      '[data-testid*="download"]',
      'a:has-text("Download")',
      'button:has-text("Download")'
    ]

    log('Looking for download functionality')
    for (const selector of download_selectors) {
      try {
        const element = await page.$(selector)
        if (element) {
          log(`Found download element: ${selector}`)
          await element.click()
          await wait(DIALOG_WAIT_TIME)
          break
        }
      } catch {
        // Continue to next selector
      }
    }

    // Try XPath for text-based search
    try {
      const download_links = await page.$$('a, button')
      for (const link of download_links) {
        const text = await page.evaluate(
          (el) => el.textContent?.trim(),
          link
        )
        if (text && text.toLowerCase().includes('download')) {
          log(`Found download element via text: "${text}"`)
          await link.click()
          await wait(DIALOG_WAIT_TIME)
          break
        }
      }
    } catch {
      log('Text-based search for download failed')
    }

    // Select date range if available
    try {
      const date_range_select = await page.$(
        '#select-downloadActivityOptionId, [data-testid*="date-range"]'
      )
      if (date_range_select) {
        await page.select(
          '#select-downloadActivityOptionId',
          'DATE_RANGE'
        )
        log('Selected custom date range')
        await wait(DOWNLOAD_CHECK_INTERVAL)
      }
    } catch {
      log('No date range selector found')
    }

    // Click download/submit button
    try {
      const download_button = await page.$(
        '#download, [data-testid*="download-submit"], button[type="submit"]'
      )
      if (download_button) {
        await download_button.click()
        log('Clicked download button')
      }
    } catch {
      log('No download button found')
    }

    // Wait for the file
    const downloaded_file = await wait_for_csv_file(
      download_dir,
      DOWNLOAD_TIMEOUT
    )

    if (!downloaded_file) {
      throw new Error(
        'Downloaded file not found after waiting. Manual download may be required.'
      )
    }

    // Rename to structured filename
    const target_filename = create_target_filename(from_date, to_date)
    const downloaded_path = path.join(download_dir, downloaded_file)
    const target_path = path.join(download_dir, target_filename)

    fs.renameSync(downloaded_path, target_path)
    log(`Renamed ${downloaded_file} to ${target_filename}`)

    return target_filename
  } finally {
    await browser.close()
    log('Browser closed')
  }
}
