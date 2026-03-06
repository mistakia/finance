import debug from 'debug'
import path from 'path'
import fs from 'fs'

import { launch_persistent_context, create_page, wait } from './stealth-browser.mjs'

const log = debug('home-depot')

const AUTH_WAIT_TIMEOUT = 180000
const DIALOG_WAIT_TIME = 3000
const DOWNLOAD_TIMEOUT = 60000

const attempt_login = async ({ page, credentials }) => {
  log('Navigating to Home Depot sign-in')

  await page.goto('https://www.homedepot.com/auth/view/signin', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  })
  await wait(DIALOG_WAIT_TIME)

  // Check if already authenticated
  if (page.url().includes('/myaccount') || page.url().includes('/home')) {
    log('Already authenticated via session cookies')
    return true
  }

  const email_locator = page.locator('#username')
  try {
    await email_locator.waitFor({ timeout: 15000 })
  } catch {
    log('No login form found')
    return false
  }

  await email_locator.fill(credentials.username)
  await wait(1000)

  // Home Depot may have a multi-step login (email first, then password)
  let password_locator = page.locator('#password')
  if (!(await password_locator.isVisible().catch(() => false))) {
    // Try submitting email first
    const continue_button = page.locator('button[type="submit"]')
    if (await continue_button.count()) {
      await continue_button.click()
      log('Submitted email, waiting for password step')
      await wait(DIALOG_WAIT_TIME)
    }

    // Wait for password field -- may have different selector after email step
    password_locator = page.locator('#password, input[type="password"]')
    try {
      await password_locator.waitFor({ timeout: 15000 })
    } catch {
      log('Password field not found after email submission. Current URL: %s', page.url())
      const visible_text = await page.locator('body').innerText().catch(() => '')
      if (visible_text.includes('captcha') || visible_text.includes('robot') || visible_text.includes('verify')) {
        log('Captcha or verification detected -- requires manual completion')
      }
      return false
    }
  }

  await password_locator.fill(credentials.password)
  await wait(1000)

  const signin_button = page.locator('button[type="submit"]')
  await signin_button.click()
  log('Submitted login form')

  try {
    await page.waitForURL(/homedepot\.com/, { timeout: 30000 })
  } catch {
    log('Navigation timeout after login submit')
  }

  await wait(DIALOG_WAIT_TIME)
  return !page.url().includes('/auth/view/signin')
}

const navigate_to_purchase_history = async (page) => {
  log('Navigating to Pro purchase history')

  // Pro accounts have purchase history at /myaccount/purchasehistory
  await page.goto('https://www.homedepot.com/myaccount/purchasehistory', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  })
  await wait(DIALOG_WAIT_TIME * 2)

  log('Current URL: %s', page.url())
}

const download_purchase_detail_csv = async ({ page, download_dir }) => {
  // Look for download/export buttons on the purchase history page
  const download_selectors = [
    'button:has-text("Download")',
    'button:has-text("Export")',
    'a:has-text("Download")',
    'a:has-text("Export")',
    '[data-testid*="download"]',
    '[data-testid*="export"]'
  ]

  for (const selector of download_selectors) {
    const el = page.locator(selector).first()
    if (await el.count()) {
      log('Found download element: %s', selector)
      const download_promise = page.waitForEvent('download', { timeout: DOWNLOAD_TIMEOUT }).catch(() => null)
      await el.click()
      await wait(DIALOG_WAIT_TIME)

      const download = await download_promise
      if (download) {
        const year = new Date().getFullYear()
        const target_filename = `${year}_home_depot_details.csv`
        const target_path = path.join(download_dir, target_filename)
        await download.saveAs(target_path)
        log('Saved download as %s', target_filename)
        return target_filename
      }
    }
  }

  // Fallback: search links and buttons by text
  const all_clickables = page.locator('a, button')
  const count = await all_clickables.count()
  for (let i = 0; i < count; i++) {
    const el = all_clickables.nth(i)
    const text = ((await el.textContent()) || '').trim().toLowerCase()
    if (text.includes('download') || text.includes('export') || text.includes('csv')) {
      log('Found download element via text: "%s"', text)
      const download_promise = page.waitForEvent('download', { timeout: DOWNLOAD_TIMEOUT }).catch(() => null)
      await el.click()
      await wait(DIALOG_WAIT_TIME)

      const download = await download_promise
      if (download) {
        const year = new Date().getFullYear()
        const target_filename = `${year}_home_depot_details.csv`
        const target_path = path.join(download_dir, target_filename)
        await download.saveAs(target_path)
        log('Saved download as %s', target_filename)
        return target_filename
      }
    }
  }

  return null
}

export const download_receipts = async ({
  credentials,
  download_dir,
  user_data_dir = null
}) => {
  if (!credentials || !credentials.username || !credentials.password) {
    throw new Error('Home Depot credentials (username, password) are required')
  }

  if (!fs.existsSync(download_dir)) {
    fs.mkdirSync(download_dir, { recursive: true })
  }

  const profile_dir = user_data_dir || path.join(
    process.env.HOME,
    '.home-depot-stealth-profile'
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
      log('Waiting for manual authentication -- complete login/2FA in the browser window')
      const auth_start = Date.now()
      while (Date.now() - auth_start < AUTH_WAIT_TIMEOUT) {
        if (!page.url().includes('/auth/view/signin')) {
          authenticated = true
          break
        }
        await wait(DIALOG_WAIT_TIME)
      }
    }

    if (!authenticated) {
      throw new Error('Authentication timeout -- could not reach Home Depot account')
    }

    log('Authenticated successfully')

    await navigate_to_purchase_history(page)

    const filename = await download_purchase_detail_csv({ page, download_dir })

    if (!filename) {
      throw new Error('Could not find or trigger purchase history download. Manual download may be required.')
    }

    return filename
  } finally {
    await context.close()
    log('Browser closed')
  }
}
