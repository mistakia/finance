import debug from 'debug'
import prompt from 'prompt'
import puppeteer from 'puppeteer'

// import yargs from 'yargs'
// import { hideBin } from 'yargs/helpers'

// import db from '../db/index.js'
import config from '../config.js'
import { isMain } from '../common/index.js'

// const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-ally-bank')
debug.enable('import-ally-bank')

const getBalances = async () => {
  const browser = await puppeteer.launch({ headless: false })
  const page = await browser.newPage()
  await page.goto('https://secure.ally.com/', {
    waitUntil: 'networkidle2'
  })

  await page.type('#username', config.links.ally_bank.username)
  await page.type('#password', config.links.ally_bank.password)
  await Promise.all([
    page.evaluate(() => {
      document.querySelector('button[type=submit]').click()
    }),
    page.waitForNavigation({ waitUntil: 'networkidle0' })
  ])

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
    const { code } = await prompt.get(['code'])
    log(code)
  }

  // get balances
  const checkingAccounts = await page.$$eval(
    '#main table:not(.savings-table) tbody tr',
    (rows) =>
      rows.map((row) => ({
        name: row.querySelector('td:nth-child(1) a').innerText,
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
    '#main table.savings-table tbody tr',
    (rows) =>
      rows.map((row) => ({
        name: row.querySelector('td:nth-child(1) a').innerText,
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

  await browser.close()

  return [...checkingAccounts, ...savingAccounts]
}

const run = async () => {
  const accounts = await getBalances()
  log(accounts)
}

export default run

const main = async () => {
  let error
  try {
    await run()
  } catch (err) {
    error = err
    console.log(error)
  }

  /* await db('jobs').insert({
   *   type: constants.jobs.EXAMPLE,
   *   succ: error ? 0 : 1,
   *   reason: error ? error.message : null,
   *   timestamp: Math.round(Date.now() / 1000)
   * })
   */
  process.exit()
}

if (isMain) {
  main()
}
