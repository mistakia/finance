import prompt from 'prompt'
import debug from 'debug'

import { getPage } from './puppeteer.mjs'
import websocket_prompt from '#root/api/prompt.mjs'

const log = debug('schwab')

export const get_accounts = async ({
  public_key,
  username,
  password,
  cli = false
}) => {
  log('Starting getAccounts function')
  const { page, browser } = await getPage('https://www.schwab.com/')
  log('Got page and browser')

  await page.waitForNetworkIdle({ idleTime: 1000, timeout: 0 })
  log('Waited for network idle')

  const login_frame_name = 'schwablmslogin'
  await page.waitForSelector(`#${login_frame_name}`)
  log('Waited for login frame')

  const login_frame = page
    .frames()
    .find((frame) => frame.name() === login_frame_name)
  await login_frame.click('[placeholder="Login ID"]')
  await login_frame.type('[placeholder="Login ID"]', username)
  log('Entered username')

  await login_frame.type('[placeholder="Password"]', password)
  log('Entered password')
  await Promise.all([
    page.waitForNavigation(),
    login_frame.focus('[placeholder="Password"]'),
    page.keyboard.press('Enter')
  ])
  log('Pressed Enter')

  while (
    page.url() !== 'https://client.schwab.com/clientapps/accounts/summary/'
  ) {
    await page.waitForTimeout(3500)

    const body_text = await page.evaluate(() => document.body.innerText)
    if (body_text.includes('We sent notification to your mobile device')) {
      log('detected mobile notification, waiting for URL change')
      await page.waitForFunction(
        'document.URL.startsWith("https://client.schwab.com/clientapps/accounts/summary/")',
        { timeout: 0 }
      )
      log('url change detected, continuing')
    } else {
      try {
        await Promise.all([
          page.waitForNavigation(),
          page.click('[aria-label="Text me a 6 digit security code"]')
        ])
        log('Clicked on security code button')
      } catch (err) {
        console.log(err)
        await page.click('input[name="DeliveryMethodSelection"]')
        await page.click('text=Text Message')
        await page.click('input:has-text("Continue")')
        log('Handled error and clicked on Continue')
      }

      // enter security code
      const inputs = ['code']
      let code
      if (cli) {
        const res = await prompt.get(inputs)
        code = res.code
      } else {
        const res = await websocket_prompt({ public_key, inputs })
        code = res.code
      }
      log('Got security code')

      try {
        await page.click('input[type="text"]')
        await page.type('input[type="text"]', code)
        await Promise.all([
          page.waitForNavigation(),
          page.click('#continueButton')
        ])
        log('Entered security code and clicked on Continue')
      } catch (err) {
        console.log(err)
        await page.click('[placeholder="Access Code"]', code)
        await page.type('[placeholder="Access Code"]', code)
        await Promise.all([
          page.waitForNavigation(),
          page.click('#continueButton')
        ])
        log('Handled error, entered security code and clicked on Continue')
      }
    }
  }

  await page.waitForTimeout(3500)
  log('Waited for timeout')

  let accounts = []
  log('Initialized accounts')

  try {
    const data = await page.evaluate(async () => {
      const response = await fetch(
        'https://client.schwab.com/api/PositionV2/PositionsDataV2'
      )

      return response.json()
    })
    log('Fetched data')

    if (data && data.Accounts) {
      accounts = data.Accounts
    }
    log('Got accounts')
  } catch (err) {
    console.log(err)
  }

  await browser.close()
  log('Closed browser')

  return accounts
}
