import { getPage } from './puppeteer.mjs'

// const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export const getBalances = async ({ publicKey, username, password }) => {
  const { page, browser } = await getPage(
    'https://www.peerstreet.com/users/sign_in'
  )

  page.waitForNetworkIdle()

  await page.waitForTimeout(1000)

  await page.type('input#user_email', username)
  const elementHandle = await page.$('input#user_password')
  await elementHandle.type(password)
  await elementHandle.press('Enter')

  await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 0 })

  await page.goto('https://www.peerstreet.com/positions', {
    waitUntil: 'networkidle0',
    timeout: 0
  })

  const loanBalance = await page.$eval(
    '.account-info-bar ul li:nth-child(3) span',
    (el) => parseFloat(el.innerText.replace('$', '').replace(',', ''))
  )

  const pocketBalance = await page.$eval(
    '.account-info-bar ul li:nth-child(4) span',
    (el) => parseFloat(el.innerText.replace('$', '').replace(',', ''))
  )

  const cashBalance = await page.$eval(
    '.account-info-bar ul li:nth-child(5) span',
    (el) => parseFloat(el.innerText.replace('$', '').replace(',', ''))
  )

  const activePositions = await page.$$eval(
    'table.table.active-positions-table tbody tr',
    (rows) =>
      rows.map((row) => ({
        property: row.querySelector('td:nth-child(1) a').innerText,
        initial_investment: parseFloat(
          row
            .querySelector('td:nth-child(2)')
            .innerText.replace('$', '')
            .replace(',', '')
        ),
        outstanding_balance: parseFloat(
          row
            .querySelector('td:nth-child(3)')
            .innerText.replace('$', '')
            .replace(',', '')
        ),
        rate: parseFloat(
          row.querySelector('td:nth-child(4) span').innerText.replace('%', '')
        ),
        earnings: parseFloat(
          row
            .querySelector('td:nth-child(5)')
            .innerText.replace('$', '')
            .replace('+', '')
        ),
        start_date: row.querySelector('td:nth-child(6)').innerText,
        maturity_date: row.querySelector('td:nth-child(7)').innerText,
        status: row.querySelector('td:nth-child(8) a').innerText
      }))
  )

  // await wait(1000000)

  await browser.close()

  return {
    loanBalance,
    pocketBalance,
    cashBalance,
    activePositions
  }
}
