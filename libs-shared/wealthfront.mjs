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

  await page.waitForFunction(() => {
    const submitButton = document.querySelector('button[type="submit"]')
    return !submitButton.disabled
  })

  await elementHandle.press('Enter')

  await page.waitForTimeout(5000)
  // disabled for now as it seems to hang
  // await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 5000 })

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

  const get_account_composition = async ({ account_id, externalized_id }) => {
    page.goto(`https://www.wealthfront.com/accounts/${account_id}`)
    const res = await page.waitForResponse(
      `https://www.wealthfront.com/capitan/v1/accounts/${externalized_id}/composition`,
      { timeout: 0 }
    )
    return res.json()
  }

  const investment_accounts = []
  const i_accounts = data.accountOverviews.filter(
    (d) => d.type === 'investment-account'
  )

  for (const account of i_accounts) {
    const account_id = account.accountId
    const externalized_id = account.externalizedAccountId
    if (account.state === 'CLOSING' || account.state === 'CLOSED') {
      investment_accounts.push({
        name: account.accountDisplayName,
        account_id,
        externalized_id,
        type: 'investment',
        balance: Number(account.accountValueSummary.totalValue),
        state: account.state
      })
      continue
    }

    const account_composition = await get_account_composition({
      account_id,
      externalized_id
    })
    investment_accounts.push({
      name: account.accountDisplayName,
      account_id,
      externalized_id,
      type: 'investment',
      balance: Number(account.accountValueSummary.totalValue),
      composition: account_composition,
      state: account.state
    })
  }

  const cash_accounts = data.accountOverviews
    .filter((d) => d.type === 'cash-account')
    .map((d) => ({
      name: d.accountDisplayName,
      account_id: d.accountId,
      type: 'cash',
      balance: Number(d.accountValueSummary.totalValue),
      apy: d.currentRate,
      state: d.state
    }))

  await browser.close()

  return [...cash_accounts, ...investment_accounts]
}
