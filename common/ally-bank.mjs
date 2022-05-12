import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import AnonymizeUaPlugin from 'puppeteer-extra-plugin-anonymize-ua'

import websocket_prompt from '#root/api/prompt.mjs'
import prompt from 'prompt'

puppeteer.use(StealthPlugin())
puppeteer.use(AnonymizeUaPlugin())

// const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export const getBalances = async ({
  publicKey,
  username,
  password,
  cli = false
}) => {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-infobars',
    '--window-position=0,0',
    '--ignore-certifcate-errors',
    '--ignore-certifcate-errors-spki-list',
    '--user-agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.64 Safari/537.36"'
  ]
  const browser = await puppeteer.launch({
    headless: false,
    args,
    timeout: 0, // 90000,
    ignoreDefaultArgs: ['--enable-automation']
  })

  const page = await browser.newPage()
  await page.goto('https://ally.com/')

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

  await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 0 })

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

    // click continue
    // '#main button[type=button][allytmln=continue]'

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
    console.log(code)
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
