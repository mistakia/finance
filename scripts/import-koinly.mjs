import debug from 'debug'
import dayjs from 'dayjs'
import fetch from 'node-fetch'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import config from '#config'
import { isMain, wait } from '#libs-shared'

const argv = yargs(hideBin(process.argv)).argv
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

const formatTransaction = ({ item, publicKey }) => {
  const data = {
    link: `/${publicKey}/koinly/${item.id}`,
    type: getType(item),
    from_link:
      item.from &&
      `/${publicKey}/${getWallet(item.from.wallet.name)}/${
        item.from.currency.symbol
      }`,
    from_amount: item.from && parseFloat(item.from.amount),
    from_symbol: item.from && item.from.currency.symbol,
    to_link:
      item.to &&
      `/${publicKey}/${getWallet(item.to.wallet.name)}/${
        item.to.currency.symbol
      }`,
    to_amount: item.to && parseFloat(item.to.amount),
    to_symbol: item.to && item.to.currency.symbol,
    fee_amount: item.fee && parseFloat(item.fee.amount),
    fee_symbol: item.fee && item.fee.currency.symbol,
    fee_link:
      item.fee &&
      `/${publicKey}/${getWallet(item.fee.wallet.name)}/${
        item.fee.currency.symbol
      }`,
    date: dayjs(item.date).unix(),
    tx_id: item.txhash,
    tx_src: item.txsrc,
    tx_dest: item.tx_dest,
    tx_label: item.label,
    desc: item.description
  }

  if (item.txdest && !data.to_link) {
    data.to_link = `/${publicKey}/self/${item.from.currency.symbol}/${item.txdest}`
    data.to_symbol = item.from.currency.symbol
    // data.to_amount
  }

  if (item.txsrc && !data.from_link) {
    data.from_link = `/${publicKey}/self/${item.to.currency.symbol}/${item.txsrc}`
    data.from_symbol = item.to.currency.symbol
    // data.from_amount
  }

  return data
}

const getTransactions = async ({
  page,
  auth_token,
  portfolio_token,
  cookie,
  user_agent,
  publicKey
}) => {
  const URL = `https://api.koinly.io/api/transactions?per_page=25&order=date&page=${page}`
  log(URL)
  const data = await fetch(URL, {
    headers: {
      'x-auth-token': auth_token,
      'x-portfolio-token': portfolio_token,
      cookie,
      'user-agent': user_agent
    }
  }).then((res) => res.json())
  log(data.meta.page)
  log(`Received ${data.transactions.length} transactions`)

  const inserts = data.transactions.map((item) =>
    formatTransaction({ item, publicKey })
  )
  if (inserts.length) {
    log(`Inserting ${inserts.length} transactions into database`)
    await db('transactions').insert(inserts).onConflict().merge()
  }

  return data
}

const run = async ({ credentials, publicKey }) => {
  log('importing transactions')
  let page = 1
  let res
  do {
    res = await getTransactions({ page, publicKey, ...credentials })
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
    const publicKey = argv.publicKey
    if (!publicKey) {
      console.log('missing --public-key')
      return
    }

    const credentials = config.koinly
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
