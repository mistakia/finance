import debug from 'debug'
import fetch from 'node-fetch'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import config from '#config'
import { isMain, wait } from '#libs-shared'
import { parse_transactions } from '../libs-server/parsers/koinly.mjs'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-transactions-koinly')
debug.enable('import-transactions-koinly')

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

  const inserts = parse_transactions({
    items: data.transactions,
    owner: publicKey
  })

  if (inserts.length) {
    log(`Inserting ${inserts.length} transactions into database`)
    await db('transactions').insert(inserts).onConflict('link').merge()
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

  process.exit()
}

if (isMain(import.meta.url)) {
  main()
}
