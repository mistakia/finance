import prompt from 'prompt'

import { getPage } from './puppeteer.mjs'
import websocket_prompt from '#root/api/prompt.mjs'

export const getAccounts = async ({
  publicKey,
  username,
  password,
  cli = false
}) => {
  const { page, browser } = await getPage('https://www.schwab.com/')

  await page.waitForNetworkIdle({ idleTime: 1000, timeout: 0 })

  const login_frame_name = 'schwablmslogin'
  await page.waitForSelector(`#${login_frame_name}`)

  const login_frame = page
    .frames()
    .find((frame) => frame.name() === login_frame_name)
  await login_frame.click('[placeholder="Login ID"]')
  await login_frame.type('[placeholder="Login ID"]', username)

  await login_frame.type('[placeholder="Password"]', password)
  await Promise.all([
    page.waitForNavigation(),
    login_frame.focus('[placeholder="Password"]'),
    page.keyboard.press('Enter')
  ])

  await page.waitForTimeout(10000)

  if (page.url() !== 'https://client.schwab.com/clientapps/accounts/summary/') {
    try {
      await Promise.all([
        page.waitForNavigation(),
        page.click('[aria-label="Text me a 6 digit security code"]')
      ])
    } catch (err) {
      console.log(err)
      await page.click('input[name="DeliveryMethodSelection"]')
      await page.click('text=Text Message')
      await page.click('input:has-text("Continue")')
    }

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

    try {
      await page.click('input[type="text"]')
      await page.type('input[type="text"]', code)
      await Promise.all([
        page.waitForNavigation(),
        page.click('#continueButton')
      ])
    } catch (err) {
      console.log(err)
      await page.click('[placeholder="Access Code"]', code)
      await page.type('[placeholder="Access Code"]', code)
      await Promise.all([
        page.waitForNavigation(),
        page.click('#continueButton')
      ])
    }
  }

  await page.waitForTimeout(3500)

  let accounts = []

  try {
    const data = await page.evaluate(async () => {
      const response = await fetch(
        'https://client.schwab.com/api/PositionV2/PositionsDataV2'
      )

      return response.json()
    })

    if (data && data.Accounts) {
      accounts = data.Accounts
    }
  } catch (err) {
    console.log(err)
  }

  await browser.close()

  return accounts
}
