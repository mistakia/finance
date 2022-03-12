import OAuth from 'oauth-1.0a'
import crypto from 'crypto'
import debug from 'debug'
import fetch from 'node-fetch'
// import yargs from 'yargs'
// import { hideBin } from 'yargs/helpers'

import db from '../db/index.js'
import config from '../config.js'
import { isMain } from '../common/index.js'

// const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-ally-invest')
debug.enable('import-ally-invest')

const oauth = OAuth({
  consumer: {
    key: config.links.ally.consumer_key,
    secret: config.links.ally.consumer_secret
  },
  signature_method: 'HMAC-SHA1',
  hash_function(base_string, key) {
    return crypto.createHmac('sha1', key).update(base_string).digest('base64')
  }
})

const formatAsset = (item) => ({
  link: `/user/ally-invest/${item.displaydata.symbol}`,
  name: item.displaydata.desc,
  cost_basis: parseFloat(item.costbasis),
  quantity: parseInt(item.qty, 10),
  symbol: item.displaydata.symbol
})

const getAccounts = async () => {
  const request_data = {
    url: 'https://devapi.invest.ally.com/v1/accounts.json',
    method: 'GET'
  }

  const token = {
    key: config.links.ally.oauth_key,
    secret: config.links.ally.oauth_secret
  }

  return await fetch(request_data.url, {
    headers: oauth.toHeader(oauth.authorize(request_data, token))
  }).then((res) => res.json())
}

const run = async () => {
  const data = await getAccounts()
  log(data)
  const inserts =
    data.response.accounts.accountsummary.accountholdings.holding.map((i) =>
      formatAsset(i)
    )
  const cash = parseFloat(
    data.response.accounts.accountsummary.accountbalance.money.cash
  )
  inserts.push({
    link: '/user/ally-invest/USD',
    name: 'Cash',
    cost_basis: cash,
    quantity: cash,
    symbol: 'USD'
  })
  // add cash balance
  log(inserts)

  await db('assets').insert(inserts).onConflict().merge()
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
