import debug from 'debug'
import dayjs from 'dayjs'
import fetch from 'node-fetch'
// import yargs from 'yargs'
// import { hideBin } from 'yargs/helpers'

import db from '../db/index.js'
import config from '../config.js'
import { isMain, wait } from '../common/index.js'

// const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-transactions-koinly')
debug.enable('import-transactions-koinly')

const getType = (item) => {
  const income = [
    'staking',
    'other_income',
    'airdrop',
    'mining',
    'loan_interest',
    'fork'
  ]
  switch (item.type) {
    // either purchase, transfer, cost, or gift
    case 'crypto_withdrawal':
      return 'purchase'

    // either income or transfer
    case 'crypto_deposit': {
      if (income.includes(item.label)) {
        return 'income'
      } else {
        return 'transfer'
      }
    }

    case 'fiat_deposit':
      return 'transfer'

    case 'fiat_withdrawal':
      return 'transfer'

    case 'exchange':
    case 'buy':
    case 'sell':
      return 'exchange'

    case 'transfer':
      return 'transfer'

    default:
      throw new Error(`unrecognized type: ${item.type}`)
  }
}

const getWallet = (string) => string.replace(/\s+/g, '-').toLowerCase()

const formatTransaction = (item) => {
  const data = {
    link: `/user/koinly/${item.id}`,
    type: getType(item),
    from_link:
      item.from &&
      `/user/${getWallet(item.from.wallet.name)}/${item.from.currency.symbol}`,
    from_amount: item.from && parseFloat(item.from.amount),
    from_symbol: item.from && item.from.currency.symbol,
    to_link:
      item.to &&
      `/user/${getWallet(item.to.wallet.name)}/${item.to.currency.symbol}`,
    to_amount: item.to && parseFloat(item.to.amount),
    to_symbol: item.to && item.to.currency.symbol,
    fee_amount: item.fee && parseFloat(item.fee.amount),
    fee_symbol: item.fee && item.fee.currency.symbol,
    fee_link:
      item.fee &&
      `/user/${getWallet(item.fee.wallet.name)}/${item.fee.currency.symbol}`,
    date: dayjs(item.date).unix(),
    tx_id: item.txhash,
    tx_src: item.txsrc,
    tx_dest: item.tx_dest,
    tx_label: item.label,
    desc: item.description
  }

  if (item.txdest && !data.to_link) {
    data.to_link = `/user/self/${item.from.currency.symbol}/${item.txdest}`
    data.to_symbol = item.from.currency.symbol
    // data.to_amount
  }

  if (item.txsrc && !data.from_link) {
    data.from_link = `/user/self/${item.to.currency.symbol}/${item.txsrc}`
    data.from_symbol = item.to.currency.symbol
    // data.from_amount
  }

  return data
}

const getTransactions = async ({ page }) => {
  const URL = `https://api.koinly.io/api/transactions?per_page=25&order=date&page=${page}`
  log(URL)
  const data = await fetch(URL, {
    headers: {
      'x-auth-token': config.koinly.auth_token,
      'x-portfolio-token': config.koinly.portfolio_token,
      cookie: config.koinly.cookie,
      'user-agent': config.koinly.user_agent
    }
  }).then((res) => res.json())
  log(data.meta.page)
  log(`Received ${data.transactions.length} transactions`)

  const inserts = data.transactions.map(formatTransaction)
  if (inserts.length) {
    log(`Inserting ${inserts.length} transactions into database`)
    await db('transactions').insert(inserts).onConflict().merge()
  }

  return data
}

const run = async () => {
  log('importing transactions')
  let page = 1
  let res
  do {
    res = await getTransactions({ page })
    if (res) {
      page += 1
    }

    await wait(3000)
  } while (res && page <= res.meta.page.total_pages)
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
