import prompt from 'prompt'
import debug from 'debug'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { getPage } from './puppeteer.mjs'
import websocket_prompt from '#root/api/prompt.mjs'
import { wait } from '#libs-shared'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const log = debug('ally-bank')

// Constants for timeouts and intervals
const DOWNLOAD_TIMEOUT = 30000 // 30 seconds
const DOWNLOAD_CHECK_INTERVAL = 1000 // 1 second
const PAGE_LOAD_TIMEOUT = 60000 // 60 seconds
const DIALOG_WAIT_TIME = 3000 // 3 seconds
const BETWEEN_ACCOUNTS_WAIT = 5000 // 5 seconds
const INITIAL_PAGE_WAIT = 20000 // 20 seconds
const MOUSE_MOVE_WAIT = 1000 // 1 second
const MOUSE_MOVE_WAIT_LONG = 1500 // 1.5 seconds
const DASHBOARD_CHECK_INTERVAL = 3500 // 3.5 seconds

// Constants for file handling
const DOWNLOADED_FILE_NAME = 'transactions.csv'
const DOWNLOAD_PATH = path.join(__dirname, '..', 'import-data')

// Constants for selectors
const SELECTORS = {
  // Login page
  LOGIN_BUTTON: 'button#login, button[data-allytmln="temporary-login"]',
  USERNAME_INPUT: 'input[autocomplete="username"]',
  PASSWORD_INPUT: 'input[type="password"]',
  OTP_INPUT: '#otpCode',
  MAIN_CONTENT: '#main',

  // Account page
  DOWNLOAD_BUTTON: 'button[data-testid="download-button"]',
  FORMAT_SELECT: 'select[data-testid="file-format"]',
  DATE_RANGE_SELECT: 'select[data-testid="date-picker"]',
  DATE_PICKER_GROUP: '[data-testid="mui-date-picker-field-group"]',
  DOWNLOAD_SUBMIT: 'button[data-testid="download-submit-button"]',

  // Dashboard page
  CHECKING_ACCOUNTS: 'div[name="interest-checking"] table tbody tr',
  SAVING_ACCOUNTS: 'div[name="savings"] table tbody tr'
}

// Helper functions
const format_date = (date_str) => {
  const [year, month, day] = date_str.split('-')
  return `${month}/${day}/${year}`
}

const create_safe_filename = (account_name, account_last_four, from_date, to_date) => {
  const safe_name = account_name.replace(/[^a-z0-9]/gi, '_').toLowerCase()
  return `ally_${safe_name}_${account_last_four}_${from_date}_to_${to_date}.csv`
}

const wait_for_file = async (download_path, timeout) => {
  const start_time = Date.now()
  while (Date.now() - start_time < timeout) {
    const files = fs.readdirSync(download_path)
    const csv_files = files
      .filter((file) => file === DOWNLOADED_FILE_NAME)
      .map((file) => ({
        name: file,
        created: fs.statSync(path.join(download_path, file)).birthtime
      }))
      .sort((a, b) => b.created - a.created)

    if (csv_files.length > 0) {
      return csv_files[0].name
    }

    await wait(DOWNLOAD_CHECK_INTERVAL)
  }
  return null
}

export const get_transactions = async ({
  page,
  account_id,
  account_name,
  account_last_four,
  from_date = null,
  to_date = null
}) => {
  log(`Downloading transactions for account ${account_last_four}`)

  // Set default dates if not provided
  if (!from_date) {
    const current_year = new Date().getFullYear()
    from_date = `${current_year}-01-01`
  }

  if (!to_date) {
    const today = new Date()
    to_date = today.toISOString().split('T')[0]
  }

  // Set download behavior for Puppeteer
  const client = await page.target().createCDPSession()
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: DOWNLOAD_PATH
  })
  log('Set download behavior')

  // First navigate to the account page to generate necessary cookies
  const account_url = `https://secure.ally.com/account/${account_id}/details`
  log(`Navigating to account page: ${account_url}`)
  await page.goto(account_url, { waitUntil: 'networkidle0', timeout: PAGE_LOAD_TIMEOUT })

  // Wait for page to load
  await wait(DIALOG_WAIT_TIME)

  // Click on the Download Transactions button to generate necessary cookies
  log('Looking for Download Transactions button')
  try {
    await page.waitForSelector(SELECTORS.DOWNLOAD_BUTTON, {
      timeout: 10000
    })
    await page.click(SELECTORS.DOWNLOAD_BUTTON)
    log('Clicked Download Transactions button')

    // Wait for download dialog to appear
    await wait(DIALOG_WAIT_TIME)

    // Check if download dialog appeared and handle it
    try {
      // Select CSV format from dropdown
      await page.waitForSelector(SELECTORS.FORMAT_SELECT, { timeout: 5000 })
      await page.select(SELECTORS.FORMAT_SELECT, 'csv')
      log('Selected CSV format')

      // Select custom date range
      await page.waitForSelector(SELECTORS.DATE_RANGE_SELECT)
      await page.select(SELECTORS.DATE_RANGE_SELECT, 'custom')
      log('Selected custom date range')

      // Wait for custom date inputs to appear
      await wait(DOWNLOAD_CHECK_INTERVAL)

      // Set the from date
      const formatted_from_date = format_date(from_date)
      const from_date_group = await page.waitForSelector(SELECTORS.DATE_PICKER_GROUP)
      await from_date_group.click()
      await page.keyboard.type(formatted_from_date)
      log(`Set from date to ${formatted_from_date}`)

      // Set the to date
      const formatted_to_date = format_date(to_date)
      const to_date_groups = await page.$$(SELECTORS.DATE_PICKER_GROUP)
      const to_date_group = to_date_groups[1] // Get the second date picker group
      await to_date_group.click()
      await page.keyboard.type(formatted_to_date)
      log(`Set to date to ${formatted_to_date}`)

      // Create target filename
      const target_filename = create_safe_filename(
        account_name,
        account_last_four,
        from_date,
        to_date
      )

      // Click download button in the dialog
      await page.waitForSelector(SELECTORS.DOWNLOAD_SUBMIT)
      await page.click(SELECTORS.DOWNLOAD_SUBMIT)
      log('Clicked download button in dialog')

      // Wait for the file to appear and rename it
      const downloaded_file = await wait_for_file(DOWNLOAD_PATH, DOWNLOAD_TIMEOUT)

      if (!downloaded_file) {
        throw new Error('Downloaded file not found after waiting')
      }

      const downloaded_path = path.join(DOWNLOAD_PATH, downloaded_file)
      const target_path = path.join(DOWNLOAD_PATH, target_filename)

      fs.renameSync(downloaded_path, target_path)
      log(`Renamed downloaded file to ${target_filename}`)

      return target_filename
    } catch (error) {
      log(`Dialog handling error: ${error.message}. Trying direct URL approach.`)
    }
  } catch (error) {
    log(`Could not find or click Download Transactions button: ${error.message}. Trying direct URL approach.`)
  }

  throw new Error('Could not find or click Download Transactions button')
}

export const getBalances = async ({
  publicKey,
  username,
  password,
  cli = false,
  download_transactions = false,
  from_date = null,
  to_date = null
}) => {
  log('Starting getBalances function')
  const { page, browser } = await getPage('https://ally.com/', {
    webdriver: false,
    chrome: false,
    notifications: false,
    plugins: false,
    languages: false
  })
  log('Page and browser obtained')

  await wait(INITIAL_PAGE_WAIT)
  log('Waited for initial page load')

  await page.click(SELECTORS.LOGIN_BUTTON)
  log('Clicked login button')
  await page.waitForSelector(SELECTORS.USERNAME_INPUT)
  log('Waited for username input')
  await page.mouse.move(800, 200)
  log('Moved mouse to (800, 200)')
  await wait(MOUSE_MOVE_WAIT)
  log('Waited for mouse move')
  await page.type(SELECTORS.USERNAME_INPUT, username)
  log('Typed username')
  await page.mouse.move(800, 400)
  log('Moved mouse to (800, 400)')
  await wait(MOUSE_MOVE_WAIT_LONG)
  log('Waited for mouse move')

  const elementHandle = await page.$(SELECTORS.PASSWORD_INPUT)
  log('Got password input element')
  await elementHandle.type(password)
  log('Typed password')
  await elementHandle.press('Enter')
  log('Pressed Enter')

  await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: PAGE_LOAD_TIMEOUT })
  log('Waited for navigation')

  // TODO improve this to something more stable
  // check if security step is needed
  const isSecurityStep = await page.evaluate(
    (el) => el && el.innerText.includes("Confirm it's you"),
    await page.$(SELECTORS.MAIN_CONTENT)
  )
  log('Checked if security step is needed')

  if (isSecurityStep) {
    log('Security step is needed')
    // send security code
    await Promise.all([
      page.evaluate(() => {
        document.querySelector('button[type=submit]').click()
      }),
      page.waitForNavigation({ waitUntil: 'networkidle0' })
    ])
    log('Sent security code')

    // enter security code
    const inputs = ['code']
    let code
    if (cli) {
      const res = await prompt.get(inputs)
      code = res.code
    } else {
      const res = await websocket_prompt({ publicKey, inputs })
      code = res.code
    }
    log('Got security code')

    await page.waitForSelector(SELECTORS.OTP_INPUT)
    const elementHandle2 = await page.$(SELECTORS.OTP_INPUT)
    await elementHandle2.type(code)
    log('Typed security code')
    await elementHandle2.press('Enter')
    log('Pressed Enter')

    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: PAGE_LOAD_TIMEOUT })
    log('Waited for navigation')
  }

  await page.waitForSelector(SELECTORS.MAIN_CONTENT)
  log('Waited for main element')

  const isRegisterDeviceStep = await page.evaluate(
    (el) => el && el.innerText.includes('Register this device'),
    await page.$(SELECTORS.MAIN_CONTENT)
  )

  if (isRegisterDeviceStep) {
    log('Register device step is needed')
    await Promise.all([
      page.evaluate(() => {
        document.querySelector('button[type=submit]').click()
      }),
      page.waitForNavigation({ waitUntil: 'networkidle0' })
    ])
    log('Clicked on Register this device')

    await page.waitForSelector(SELECTORS.MAIN_CONTENT)
    log('Waited for main element')
  }

  while (!page.url().includes('https://secure.ally.com/dashboard')) {
    await wait(DASHBOARD_CHECK_INTERVAL)
  }

  log('Detected dashboard page')

  await wait(DASHBOARD_CHECK_INTERVAL)

  // Extract account IDs and other information
  const checking_accounts_data = await page.$$eval(
    SELECTORS.CHECKING_ACCOUNTS,
    (rows) =>
      rows.map((row) => {
        const link_element = row.querySelector('td:nth-child(1) a')
        const href = link_element.href
        // Extract account ID from URL format like: https://secure.ally.com/account/ZUZoalduMVRNZFNTUjhTZ2SyK6ZVpgve-5b7t0ZHb-2DbUj5GRUfcUZmywTWNQjWnOkYOTVn3JRMtIHmiByS8Q/details
        const account_id = href.split('/account/')[1].split('/details')[0]
        return {
          name: link_element.innerText,
          last_four: row
            .querySelector('td:nth-child(1) div div:nth-child(2)')
            .innerText.replace('••', ''),
          type: 'checking',
          balance: parseFloat(
            row
              .querySelector('td:nth-child(3)')
              .innerText.replace('$', '')
              .replace(',', '')
          ),
          apy: parseFloat(
            row.querySelector('td:nth-child(5)').innerText.replace('%', '')
          ),
          account_id
        }
      })
  )
  log('Got checking accounts')

  const saving_accounts_data = await page.$$eval(
    SELECTORS.SAVING_ACCOUNTS,
    (rows) =>
      rows.map((row) => {
        const link_element = row.querySelector('td:nth-child(1) a')
        const href = link_element.href
        // Extract account ID from URL format like: https://secure.ally.com/account/ZUZoalduMVRNZFNTUjhTZ2SyK6ZVpgve-5b7t0ZHb-2DbUj5GRUfcUZmywTWNQjWnOkYOTVn3JRMtIHmiByS8Q/details
        const account_id = href.split('/account/')[1].split('/details')[0]
        return {
          name: link_element.innerText,
          last_four: row
            .querySelector('td:nth-child(1) div div:nth-child(2)')
            .innerText.replace('••', ''),
          type: 'savings',
          balance: parseFloat(
            row
              .querySelector('td:nth-child(3)')
              .innerText.replace('$', '')
              .replace(',', '')
          ),
          apy: parseFloat(
            row.querySelector('td:nth-child(5)').innerText.replace('%', '')
          ),
          account_id
        }
      })
  )
  log('Got saving accounts')

  const all_accounts = [...checking_accounts_data, ...saving_accounts_data]

  // Download transactions if requested
  if (download_transactions) {
    log('Starting transaction downloads')

    // Ensure import-data directory exists
    if (!fs.existsSync(DOWNLOAD_PATH)) {
      fs.mkdirSync(DOWNLOAD_PATH, { recursive: true })
    }

    const download_results = []

    for (const account of all_accounts) {
      try {
        log(`Processing transaction download for account: ${account.last_four}`)
        const filename = await get_transactions({
          page,
          account_id: account.account_id,
          account_name: account.name,
          account_last_four: account.last_four,
          from_date,
          to_date
        })

        download_results.push({
          account_last_four: account.last_four,
          success: true,
          filename
        })
      } catch (error) {
        log(
          `Error downloading transactions for account ${account.last_four}: ${error.message}`
        )
        download_results.push({
          account_last_four: account.last_four,
          success: false,
          error: error.message
        })
      }

      // Wait between requests
      log('Waiting between accounts...')
      await wait(BETWEEN_ACCOUNTS_WAIT)
    }

    log('Finished downloading all transactions')
    log(`Download results: ${JSON.stringify(download_results, null, 2)}`)

    // Add download results to account info
    all_accounts.forEach((account) => {
      const download_result = download_results.find(
        (result) => result.account_last_four === account.last_four
      )
      account.transaction_download = download_result || {
        success: false,
        error: 'Unknown error'
      }
    })
  }

  await browser.close()
  log('Closed browser')

  return all_accounts
}
