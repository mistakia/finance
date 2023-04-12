import { getPage } from './puppeteer.mjs'

import { wait } from '#common'

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

  // await wait(1000000)

  await browser.close()

  return {
    loanBalance,
    pocketBalance,
    cashBalance,
    activePositions
  }
}

const get_transaction_type = (string) => {
  // type shoould be one of INTREST, PRINCIPIAL, INVESTMENT, WITHDRAWAL, DEPOSIT, TRANSFER

  if (string.includes('Investment')) {
    return 'INVESTMENT'
  } else if (string.includes('Interest')) {
    return 'INTEREST'
  } else if (string.includes('Principal')) {
    return 'PRINCIPAL'
  } else if (string.includes('Deposit')) {
    return 'DEPOSIT'
  } else if (string.includes('Withdrawal')) {
    return 'WITHDRAWAL'
  }

  console.log('Unknown transaction type', string)
  return 'UNKNOWN'
}

const get_transaction_status = (string) => {
  // status should be one of COMPLETED, CANCELED, FAILED

  if (string.includes('CONFIRMED')) {
    return 'COMPLETED'
  } else if (string.includes('CANCELLED')) {
    return 'CANCELED'
  } else if (string.includes('FAILED')) {
    return 'FAILED'
  }

  console.log('Unknown transaction status', string)
  return 'UNKNOWN'
}

const get_transaction_amount = (str) => {
  const regex = />([^<]+)<\/span>/
  const match = regex.exec(str)
  const numStr = match[1].replace(/[^\d.-]+/g, '')
  const amount = Number(numStr)

  if (isNaN(amount)) {
    console.log('Error parsing transaction amount', str)
    return null
  }

  return amount
}

const format_transaction = ({
  amount,
  date,
  id,
  loan_id,
  loan_ps_id,
  period,
  status,
  transaction
}) => {
  // Determine the transaction type based on the text in the transaction field
  const type = get_transaction_type(transaction)

  // Determine the loan description based on the loan URL in the transaction field
  let loan_description = null
  let loan_url = null
  let loan_property_id = null

  if (transaction.includes('<a href')) {
    try {
      loan_url = transaction.match(/<a href="(.+?)">/)[1]
      const loan_id_match = loan_url.match(/\/(\d+)\//)
      loan_property_id = loan_id_match ? loan_id_match[1] : null
      loan_description = transaction.match(/>(.+?)<\/a>/)[1]
    } catch (err) {
      console.log('Error parsing transaction', transaction)
    }
  }

  // Determine the transaction status based on the status field
  const transaction_status = get_transaction_status(status)

  return {
    id,
    date,
    type,
    loan_url: `https://www.peerstreet.com${loan_url}`,
    loan_description,
    loan_id,
    loan_property_id,
    loan_ps_id,
    period,
    amount: get_transaction_amount(amount),
    status: transaction_status
  }
}

export const get_transactions = async ({ publicKey, username, password }) => {
  const { page, browser } = await getPage(
    'https://www.peerstreet.com/users/sign_in'
  )

  await page.waitForTimeout(1000)

  await page.type('input#user_email', username)
  const elementHandle = await page.$('input#user_password')
  await elementHandle.type(password)
  await elementHandle.press('Enter')

  try {
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 })
    await page.goto('https://www.peerstreet.com/history', {
      waitUntil: 'networkidle0',
      timeout: 30000
    })
    await page.waitForTimeout(5000)

    let transactions = []

    let offset = 0
    let total_items = 1

    while (offset < total_items) {
      console.log({ offset, total_items })
      const response = await page.goto(
        `https://www.peerstreet.com/history.json?draw=1&columns%5B0%5D%5Bdata%5D=date&columns%5B0%5D%5Bname%5D=&columns%5B0%5D%5Bsearchable%5D=true&columns%5B0%5D%5Borderable%5D=true&columns%5B0%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B0%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B1%5D%5Bdata%5D=transaction&columns%5B1%5D%5Bname%5D=&columns%5B1%5D%5Bsearchable%5D=true&columns%5B1%5D%5Borderable%5D=false&columns%5B1%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B1%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B2%5D%5Bdata%5D=loan_id&columns%5B2%5D%5Bname%5D=&columns%5B2%5D%5Bsearchable%5D=true&columns%5B2%5D%5Borderable%5D=false&columns%5B2%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B2%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B3%5D%5Bdata%5D=loan_ps_id&columns%5B3%5D%5Bname%5D=&columns%5B3%5D%5Bsearchable%5D=true&columns%5B3%5D%5Borderable%5D=false&columns%5B3%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B3%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B4%5D%5Bdata%5D=period&columns%5B4%5D%5Bname%5D=&columns%5B4%5D%5Bsearchable%5D=true&columns%5B4%5D%5Borderable%5D=false&columns%5B4%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B4%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B5%5D%5Bdata%5D=amount&columns%5B5%5D%5Bname%5D=&columns%5B5%5D%5Bsearchable%5D=true&columns%5B5%5D%5Borderable%5D=false&columns%5B5%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B5%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B6%5D%5Bdata%5D=status&columns%5B6%5D%5Bname%5D=&columns%5B6%5D%5Bsearchable%5D=true&columns%5B6%5D%5Borderable%5D=true&columns%5B6%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B6%5D%5Bsearch%5D%5Bregex%5D=false&order%5B0%5D%5Bcolumn%5D=0&order%5B0%5D%5Bdir%5D=desc&order%5B1%5D%5Bcolumn%5D=0&order%5B1%5D%5Bdir%5D=desc&start=${offset}&length=50&search%5Bvalue%5D=&search%5Bregex%5D=false&date_from=&date_to=&transaction_type=&_=1681263231966`,
        { waitUntil: 'networkidle0' }
      )

      const responseData = await response.json()
      const { data } = responseData
      const formatted_transactions = data.map(format_transaction)
      transactions = transactions.concat(formatted_transactions)

      total_items = responseData.recordsTotal
      offset = transactions.length

      await wait(2000)
    }

    await browser.close()

    return transactions
  } catch (err) {
    console.log(err)
  }

  await browser.close()
  return []
}
