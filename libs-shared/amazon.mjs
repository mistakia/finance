import debug from 'debug'
import path from 'path'
import fs from 'fs'

import { launch_persistent_context, create_page, wait } from './stealth-browser.mjs'

const log = debug('amazon')

const AUTH_WAIT_TIMEOUT = 180000
const DIALOG_WAIT_TIME = 3000
const DOWNLOAD_TIMEOUT = 60000

const attempt_login = async ({ page, credentials }) => {
  log('Navigating to Amazon sign-in')

  await page.goto('https://www.amazon.com/ap/signin?openid.pape.max_auth_age=0&openid.return_to=https%3A%2F%2Fwww.amazon.com%2F', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  })
  await wait(DIALOG_WAIT_TIME)

  // Check if already authenticated
  if (page.url().includes('amazon.com') && !page.url().includes('/ap/signin')) {
    log('Already authenticated via session cookies')
    return true
  }

  const email_locator = page.locator('#ap_email')
  try {
    await email_locator.waitFor({ timeout: 15000 })
  } catch {
    // May already be past email step
    const password_locator = page.locator('#ap_password')
    if (await password_locator.count()) {
      await password_locator.fill(credentials.password)
      await wait(1000)
      await page.locator('#signInSubmit').click()
      log('Submitted password')
      await wait(DIALOG_WAIT_TIME)
      return !page.url().includes('/ap/signin')
    }
    log('No login form found')
    return false
  }

  await email_locator.fill(credentials.email)
  await wait(1000)

  // Amazon sometimes splits email/password into separate pages
  const continue_button = page.locator('#continue')
  if (await continue_button.count()) {
    await continue_button.click()
    await wait(DIALOG_WAIT_TIME)
  }

  const password_locator = page.locator('#ap_password')
  try {
    await password_locator.waitFor({ timeout: 10000 })
  } catch {
    log('Password field not found after email entry')
    return false
  }

  await password_locator.fill(credentials.password)
  await wait(1000)

  const signin_button = page.locator('#signInSubmit')
  await signin_button.click()
  log('Submitted login form')

  try {
    await page.waitForURL(/amazon\.com(?!.*\/ap\/signin)/, { timeout: 30000 })
  } catch {
    log('Navigation timeout after login submit')
  }

  await wait(DIALOG_WAIT_TIME)
  return !page.url().includes('/ap/signin')
}

const request_data_download = async (page) => {
  // Navigate to Amazon's "Request Your Data" page
  log('Navigating to Amazon data request page')

  await page.goto('https://www.amazon.com/hz/privacy-central/data-requests/preview.html', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  })
  await wait(DIALOG_WAIT_TIME * 2)

  log('Current URL: %s', page.url())
  log('Page loaded -- user should select "Your Orders" category and submit request')
  log('If data is already available, look for download links')
}

const find_and_download_order_data = async ({ page, download_dir }) => {
  // Look for existing downloadable data on the privacy page
  const download_links = page.locator('a[href*="download"], button:has-text("Download")')
  const count = await download_links.count()

  if (count > 0) {
    log('Found %d download links', count)
    for (let i = 0; i < count; i++) {
      const link = download_links.nth(i)
      const text = ((await link.textContent()) || '').trim()
      log('Download link %d: "%s"', i, text)

      const download_promise = page.waitForEvent('download', { timeout: DOWNLOAD_TIMEOUT }).catch(() => null)
      await link.click()
      await wait(DIALOG_WAIT_TIME)

      const download = await download_promise
      if (download) {
        const suggested_name = download.suggestedFilename()
        const target_path = path.join(download_dir, suggested_name)
        await download.saveAs(target_path)
        log('Saved download as %s', suggested_name)
        return suggested_name
      }
    }
  }

  return null
}

export const download_order_history = async ({
  credentials,
  download_dir,
  user_data_dir = null
}) => {
  if (!credentials || !credentials.email || !credentials.password) {
    throw new Error('Amazon credentials (email, password) are required')
  }

  if (!fs.existsSync(download_dir)) {
    fs.mkdirSync(download_dir, { recursive: true })
  }

  const profile_dir = user_data_dir || path.join(
    process.env.HOME,
    '.amazon-stealth-profile'
  )

  log('Launching stealth browser with persistent profile: %s', profile_dir)
  const context = await launch_persistent_context({
    user_data_dir: profile_dir,
    headless: false
  })

  const page = await create_page(context)

  try {
    let authenticated = await attempt_login({ page, credentials })

    if (!authenticated) {
      log('Waiting for manual authentication -- complete login/2FA/captcha in the browser window')
      const auth_start = Date.now()
      while (Date.now() - auth_start < AUTH_WAIT_TIMEOUT) {
        if (!page.url().includes('/ap/signin') && !page.url().includes('/ap/mfa')) {
          authenticated = true
          break
        }
        await wait(DIALOG_WAIT_TIME)
      }
    }

    if (!authenticated) {
      throw new Error('Authentication timeout -- could not reach Amazon account')
    }

    log('Authenticated successfully')

    await request_data_download(page)

    const filename = await find_and_download_order_data({ page, download_dir })

    if (!filename) {
      log('No immediate download available. Amazon data requests can take hours/days to process.')
      log('Check https://www.amazon.com/hz/privacy-central/data-requests/preview.html later for available downloads.')
      return null
    }

    return filename
  } finally {
    await context.close()
    log('Browser closed')
  }
}
