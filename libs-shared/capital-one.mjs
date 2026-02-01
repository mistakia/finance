import debug from 'debug'
import fs from 'fs'
import path from 'path'

import { getPage } from './puppeteer.mjs'
import { wait } from '#libs-shared'

const log = debug('capital-one')

// Constants for timeouts and intervals
const DOWNLOAD_TIMEOUT = 30000
const DOWNLOAD_CHECK_INTERVAL = 1000
const PAGE_LOAD_TIMEOUT = 60000
const DIALOG_WAIT_TIME = 3000
const INITIAL_PAGE_WAIT = 10000
const MOUSE_MOVE_WAIT = 1000

// Constants for file handling
const DOWNLOADED_FILE_NAME_PATTERN = /^transaction.*\.csv$/i

// Constants for selectors
const SELECTORS = {
  USERNAME_INPUT: '#user-id',
  PASSWORD_INPUT: '#password',
  SIGN_IN_BUTTON: '#sign-in-btn',
  DOWNLOAD_LINK: '[data-testid="download-transactions"]',
  FORMAT_SELECT: '#format-select',
  DATE_RANGE_SELECT: '#date-range-select',
  DOWNLOAD_SUBMIT: '[data-testid="download-submit"]'
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

const create_target_filename = (from_date, to_date) => {
  return `capital_one_credit_card_${from_date}_to_${to_date}.csv`
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
    throw new Error(
      'Capital One credentials (username, password) are required'
    )
  }

  // Set default dates if not provided
  if (!from_date) {
    const current_year = new Date().getFullYear()
    from_date = `${current_year}-01-01`
  }

  if (!to_date) {
    to_date = new Date().toISOString().split('T')[0]
  }

  // Ensure download directory exists
  if (!fs.existsSync(download_dir)) {
    fs.mkdirSync(download_dir, { recursive: true })
  }

  log('Launching browser')
  const { page, browser } = await getPage(
    'https://www.capitalone.com/sign-in/',
    {
      webdriver: false,
      chrome: false,
      notifications: false,
      plugins: false,
      languages: false,
      user_data_dir
    }
  )

  try {
    await wait(INITIAL_PAGE_WAIT)

    // Set download behavior
    const client = await page.createCDPSession()
    await client.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: download_dir,
      eventsEnabled: true
    })

    // Login
    log('Entering credentials')
    await page.waitForSelector(SELECTORS.USERNAME_INPUT, {
      timeout: PAGE_LOAD_TIMEOUT
    })
    await page.type(SELECTORS.USERNAME_INPUT, credentials.username)
    await page.mouse.move(800, 300)
    await wait(MOUSE_MOVE_WAIT)
    await page.type(SELECTORS.PASSWORD_INPUT, credentials.password)
    await wait(MOUSE_MOVE_WAIT)
    await page.click(SELECTORS.SIGN_IN_BUTTON)
    log('Submitted login form')

    await page.waitForNavigation({
      waitUntil: 'networkidle0',
      timeout: PAGE_LOAD_TIMEOUT
    })

    // Handle 2FA if needed - pause for manual intervention
    log('Waiting for dashboard (handle 2FA manually if prompted)')
    const dashboard_timeout = 120000
    const dashboard_start = Date.now()
    while (Date.now() - dashboard_start < dashboard_timeout) {
      const url = page.url()
      if (
        url.includes('/accounts') ||
        url.includes('/dashboard') ||
        url.includes('/credit-cards')
      ) {
        break
      }
      await wait(DIALOG_WAIT_TIME)
    }
    log('Detected authenticated page')

    // Navigate to credit card activity/transactions
    log('Navigating to transactions page')
    await page.goto(
      'https://myaccounts.capitalone.com/Card/transactions',
      { waitUntil: 'networkidle0', timeout: PAGE_LOAD_TIMEOUT }
    )
    await wait(DIALOG_WAIT_TIME)

    // Look for download link
    log('Looking for download link')
    await page.waitForSelector(SELECTORS.DOWNLOAD_LINK, { timeout: 10000 })
    await page.click(SELECTORS.DOWNLOAD_LINK)
    await wait(DIALOG_WAIT_TIME)

    // Select CSV format if format selector exists
    try {
      await page.waitForSelector(SELECTORS.FORMAT_SELECT, { timeout: 5000 })
      await page.select(SELECTORS.FORMAT_SELECT, 'csv')
      log('Selected CSV format')
      await wait(DOWNLOAD_CHECK_INTERVAL)
    } catch {
      log('No format selector found, proceeding with default')
    }

    // Select date range if selector exists
    try {
      await page.waitForSelector(SELECTORS.DATE_RANGE_SELECT, {
        timeout: 5000
      })
      await page.select(SELECTORS.DATE_RANGE_SELECT, 'custom')
      log('Selected custom date range')
      await wait(DOWNLOAD_CHECK_INTERVAL)
    } catch {
      log('No date range selector found, proceeding with default range')
    }

    // Click download
    try {
      await page.waitForSelector(SELECTORS.DOWNLOAD_SUBMIT, { timeout: 5000 })
      await page.click(SELECTORS.DOWNLOAD_SUBMIT)
      log('Clicked download button')
    } catch {
      log('No download submit button found, download may have started')
    }

    // Wait for the file
    const downloaded_file = await wait_for_csv_file(
      download_dir,
      DOWNLOAD_TIMEOUT
    )

    if (!downloaded_file) {
      throw new Error('Downloaded file not found after waiting')
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
