import debug from 'debug'
import puppeteer from 'puppeteer'

import websocket_prompt from '#root/api/prompt.mjs'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

// import db from '#db'
import config from '#config'
import { isMain } from '#common'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-ally-bank')
debug.enable('import-ally-bank')

const getBalances = async ({ publicKey, username, password }) => {
  const browser = await puppeteer.launch({ headless: false })
  const page = await browser.newPage()
  await page.goto('https://secure.ally.com/', {
    waitUntil: 'networkidle2'
  })

  await page.type('#username', username)
  await page.type('#password', password)
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
    const inputs = ['code']
    const { code } = await websocket_prompt({ publicKey, inputs })
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

const run = async ({ credentials, publicKey }) => {
  const accounts = await getBalances({ publicKey, ...credentials })
  log(accounts)
}

export default run

const main = async () => {
  let error
  try {
    const publicKey = argv.publicKey
    if (!publicKey) {
      console.log('missing --public-key')
      return
    }
    const credentials = config.links.ally_bank
    await run({ credentials, publicKey })
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

if (isMain(import.meta.url)) {
  main()
}
