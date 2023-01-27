import prompt from 'prompt'

import { getPage } from './puppeteer.mjs'
import websocket_prompt from '#root/api/prompt.mjs'

export const getBalances = async ({
  publicKey,
  email,
  password,
  cli = false
}) => {
  const { page, browser } = await getPage('https://www.wealthfront.com/login', {
    webdriver: false,
    chrome: false,
    notifications: false,
    plugins: false,
    languages: false
  })

  await page.waitForTimeout(10000)

  await page.waitForSelector('input[autocomplete="email"]')
  await page.mouse.move(800, 200)
  await page.waitForTimeout(1000)

  await page.type('input[autocomplete="email"]', email)
  await page.mouse.move(800, 400)
  await page.waitForTimeout(1500)

  const elementHandle = await page.$('input#login-password')
  await elementHandle.type(password)
  await elementHandle.press('Enter')

  await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 90000 })

  // check if security step is needed
  const isSecurityStep = await page.evaluate(
    (el) => el && el.innerText.includes('We texted you'),
    await page.$('div[role="main"]')
  )

  if (isSecurityStep) {
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

    await page.waitForSelector('input#mfa-auth-code')
    const elementHandle2 = await page.$('input#mfa-auth-code')
    await elementHandle2.type(code)
    await elementHandle2.press('Enter')
  }

  const dashboard_api_response = await page.waitForResponse(
    'https://www.wealthfront.com/api/wealthfront_accounts/get_account_overviews_and_transfer_eligibilities_for_user',
    { timeout: 0 }
  )

  const data = await dashboard_api_response.json()
  console.log(data)

  // TODO - grab retirement accounts

  const cash_accounts = data.accountOverviews
    .filter((d) => d.accountType === 'TRUST_CASH')
    .map((d) => ({
      name: d.accountDisplayName,
      account_id: d.accountId,
      type: 'cash',
      balance: Number(d.accountValueSummary.totalValue),
      apy: d.currentRate
    }))

  await browser.close()

  return [...cash_accounts]
}
