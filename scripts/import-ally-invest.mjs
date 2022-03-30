import OAuth from 'oauth-1.0a'
import crypto from 'crypto'
import debug from 'debug'
import fetch from 'node-fetch'
// import yargs from 'yargs'
// import { hideBin } from 'yargs/helpers'

import db from '../db/index.mjs'
import config from '../config.mjs'
import { isMain } from '../common/index.mjs'

// const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-ally-invest')
debug.enable('import-ally-invest')

const formatAsset = ({ item, publicKey }) => ({
  link: `/${publicKey}/ally-invest/${item.displaydata.symbol}`,
  name: item.displaydata.desc,
  cost_basis: parseFloat(item.costbasis),
  quantity: parseInt(item.qty, 10),
  symbol: item.displaydata.symbol
})

const getAccounts = async ({
  consumer_key,
  consumer_secret,
  oauth_key,
  oauth_secret
}) => {
  const oauth = OAuth({
    consumer: {
      key: consumer_key,
      secret: consumer_secret
    },
    signature_method: 'HMAC-SHA1',
    hash_function(base_string, key) {
      return crypto.createHmac('sha1', key).update(base_string).digest('base64')
    }
  })

  const request_data = {
    url: 'https://devapi.invest.ally.com/v1/accounts.json',
    method: 'GET'
  }

  const token = {
    key: oauth_key,
    secret: oauth_secret
  }

  return await fetch(request_data.url, {
    headers: oauth.toHeader(oauth.authorize(request_data, token))
  }).then((res) => res.json())
}

const run = async ({ credentials, publicKey }) => {
  const data = await getAccounts({ ...credentials })
  const inserts =
    data.response.accounts.accountsummary.accountholdings.holding.map((item) =>
      formatAsset({ item, publicKey })
    )

  // add cash balance
  const cash = parseFloat(
    data.response.accounts.accountsummary.accountbalance.money.cash
  )
  inserts.push({
    link: `/${publicKey}/ally-invest/USD`,
    name: 'Cash',
    cost_basis: cash,
    quantity: cash,
    symbol: 'USD'
  })

  // log(inserts)

  if (inserts.length) {
    log(`saving ${inserts.length} holdings`)
    await db('assets').insert(inserts).onConflict().merge()
  }
}

export default run

const main = async () => {
  let error
  try {
    const publicKey = argv.publicKey
    const credentials = config.links.ally
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

if (isMain) {
  main()
}
