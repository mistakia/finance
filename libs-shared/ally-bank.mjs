import prompt from 'prompt'
import debug from 'debug'

import { getPage } from './puppeteer.mjs'
import websocket_prompt from '#root/api/prompt.mjs'

const log = debug('ally-bank')

// const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export const getBalances = async ({
  publicKey,
  username,
  password,
  cli = false
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

  await page.waitForTimeout(10000)
  log('Waited for 10 seconds')

  await page.click('button#login')
  log('Clicked login button')
  await page.waitForSelector('input[autocomplete="username"]')
  log('Waited for username input')
  await page.mouse.move(800, 200)
  log('Moved mouse to (800, 200)')
  await page.waitForTimeout(1000)
  log('Waited for 1 second')
  await page.type('input[autocomplete="username"]', username)
  log('Typed username')
  await page.mouse.move(800, 400)
  log('Moved mouse to (800, 400)')
  await page.waitForTimeout(1500)
  log('Waited for 1.5 seconds')

  const elementHandle = await page.$('input[type="password"]')
  log('Got password input element')
  await elementHandle.type(password)
  log('Typed password')
  await elementHandle.press('Enter')
  log('Pressed Enter')

  await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 90000 })
  log('Waited for navigation')

  // TODO improve this to something more stable
  // check if security step is needed
  const isSecurityStep = await page.evaluate(
    (el) => el && el.innerText.includes("Confirm it's you"),
    await page.$('#main')
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

    await page.waitForSelector('#otpCode')
    const elementHandle2 = await page.$('#otpCode')
    await elementHandle2.type(code)
    log('Typed security code')
    await elementHandle2.press('Enter')
    log('Pressed Enter')

    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 90000 })
    log('Waited for navigation')
  }

  await page.waitForSelector('#main')
  log('Waited for main element')

  const isRegisterDeviceStep = await page.evaluate(
    (el) => el && el.innerText.includes('Register this device'),
    await page.$('#main')
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

    await page.waitForSelector('#main')
    log('Waited for main element')
  }

  while (!page.url().includes('https://secure.ally.com/dashboard')) {
    await page.waitForTimeout(3500)
  }

  log('Detected dashboard page')

  await page.waitForTimeout(3500)

  // get balances
  const checkingAccounts = await page.$$eval(
    'div[name="interest-checking"] table tbody tr',
    (rows) =>
      rows.map((row) => ({
        name: row.querySelector('td:nth-child(1) a').innerText,
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
        )
      }))
  )
  log('Got checking accounts')

  const savingAccounts = await page.$$eval(
    'div[name="savings"] table tbody tr',
    (rows) =>
      rows.map((row) => ({
        name: row.querySelector('td:nth-child(1) a').innerText,
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
        )
      }))
  )
  log('Got saving accounts')

  // await wait(1000000)
  await browser.close()
  log('Closed browser')

  return [...checkingAccounts, ...savingAccounts]
}
