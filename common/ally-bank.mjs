import prompt from 'prompt'

import { getPage } from './puppeteer.mjs'
import websocket_prompt from '#root/api/prompt.mjs'

// const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export const getBalances = async ({
  publicKey,
  username,
  password,
  cli = false
}) => {
  const { page, browser } = await getPage('https://ally.com/', {
    webdriver: false,
    chrome: false,
    notifications: false,
    plugins: false,
    languages: false
  })

  await page.waitForTimeout(10000)

  await page.click('button#login-btn')
  await page.waitForSelector('#drawer-login input.js-login-v2-username')
  await page.mouse.move(800, 200)
  await page.waitForTimeout(1000)
  await page.select('#drawer-login select.allysf-login-v2-select', 'aob')
  await page.mouse.move(800, 300)
  await page.waitForTimeout(1500)
  await page.type('#drawer-login input.js-login-v2-username', username)
  await page.mouse.move(800, 400)
  await page.waitForTimeout(1500)

  const elementHandle = await page.$('#drawer-login input.js-login-v2-password')
  await elementHandle.type(password)
  await elementHandle.press('Enter')

  await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 90000 })

  // check if security step is needed
  const isSecurityStep = await page.evaluate(
    (el) => el && el.innerText.includes('Additional Verification Needed'),
    await page.$('#main')
  )

  if (isSecurityStep) {
    // send security code
    await Promise.all([
      page.evaluate(() => {
        document.querySelector('button[type=submit]').click()
      }),
      page.waitForNavigation({ waitUntil: 'networkidle0' })
    ])

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

    await page.waitForSelector('#otpCode')
    const elementHandle2 = await page.$('#otpCode')
    await elementHandle2.type(code)
    await elementHandle2.press('Enter')

    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 90000 })
  }

  await page.waitForSelector('#main')

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

  // await wait(1000000)
  await browser.close()

  return [...checkingAccounts, ...savingAccounts]
}
