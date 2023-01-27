import { getPage } from './puppeteer.mjs'

// const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export const getBalances = async ({ publicKey, username, password }) => {
  const { page, browser } = await getPage(
    'https://www.peerstreet.com/users/sign_in'
  )

  await page.waitForTimeout(1000)

  await page.type('input#user_email', username)
  const elementHandle = await page.$('input#user_password')
  await elementHandle.type(password)
  await elementHandle.press('Enter')

  try {
    await page.waitForTimeout(5000)

    await page.goto('https://www.peerstreet.com/positions', {
      waitUntil: 'networkidle0',
      timeout: 30000
    })
  } catch (err) {
    return {}
  }

  const loanBalance = await page.$eval(
    '.account-stats-slider ul li:nth-child(3) span',
    (el) => Number(el.innerText.replace('$', '').replace(',', ''))
  )

  const pocketBalance = await page.$eval(
    '.account-stats-slider ul li:nth-child(4) span',
    (el) => Number(el.innerText.replace('$', '').replace(',', ''))
  )

  const cashBalance = await page.$eval(
    '.account-stats-slider ul li:nth-child(6) span',
    (el) => Number(el.innerText.replace('$', '').replace(',', ''))
  )

  console.log('got balances')

  const activePositions = await page.$$eval(
    'table.table.active-positions-table tbody tr',
    (rows) =>
      rows.map((row) => ({
        property: row.querySelector('td:nth-child(1) a').innerText,
        initial_investment: Number(
          row
            .querySelector('td:nth-child(2)')
            .innerText.replace('$', '')
            .replace(',', '')
        ),
        outstanding_balance: Number(
          row
            .querySelector('td:nth-child(3)')
            .innerText.replace('$', '')
            .replace(',', '')
        ),
        rate: Number(
          row.querySelector('td:nth-child(4) span').innerText.replace('%', '')
        ),
        earnings: Number(
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

  console.log('got active positions')

  // await wait(1000000)

  await browser.close()

  console.log('DONE')

  return {
    loanBalance,
    pocketBalance,
    cashBalance,
    activePositions
  }
}
