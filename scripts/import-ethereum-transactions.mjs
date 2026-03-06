import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import { isMain, ethereum } from '#libs-shared'
import { get_all_connection_credentials } from './get-connection-credentials.mjs'
import { parse_transactions, parse_token_transactions, parse_internal_transactions, parse_beacon_withdrawals } from '../libs-server/parsers/ethereum.mjs'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-ethereum-transactions')
debug.enable('import-ethereum-transactions')

const run = async ({ credentials, publicKey }) => {
  const eth_txs = await ethereum.getTransactions({ ...credentials })
  const token_txs = await ethereum.getTokenTransactions({ ...credentials })

  let total = 0

  if (eth_txs && eth_txs.length) {
    const transactions = parse_transactions({
      data: eth_txs,
      owner: publicKey,
      address: credentials.address
    })
    if (transactions.length) {
      await db('transactions').insert(transactions).onConflict('link').merge()
      total += transactions.length
      log(`Inserted ${transactions.length} ETH transactions`)
    }
  }

  if (token_txs && token_txs.length) {
    const transactions = parse_token_transactions({
      data: token_txs,
      owner: publicKey,
      address: credentials.address
    })
    if (transactions.length) {
      await db('transactions').insert(transactions).onConflict('link').merge()
      total += transactions.length
      log(`Inserted ${transactions.length} token transactions`)
    }
  }

  const internal_txs = await ethereum.getInternalTransactions({ ...credentials })
  if (internal_txs && internal_txs.length) {
    const transactions = parse_internal_transactions({
      data: internal_txs,
      owner: publicKey,
      address: credentials.address
    })
    if (transactions.length) {
      await db('transactions').insert(transactions).onConflict('link').merge()
      total += transactions.length
      log(`Inserted ${transactions.length} internal transactions`)
    }
  }

  const beacon_txs = await ethereum.getBeaconWithdrawals({ ...credentials })
  if (beacon_txs && beacon_txs.length) {
    const transactions = parse_beacon_withdrawals({
      data: beacon_txs,
      owner: publicKey,
      address: credentials.address
    })
    if (transactions.length) {
      await db('transactions').insert(transactions).onConflict('link').merge()
      total += transactions.length
      log(`Inserted ${transactions.length} beacon withdrawal transactions`)
    }
  }

  if (!total) {
    log('no transactions found')
  }
}

const main = async () => {
  try {
    const publicKey = argv.publicKey
    if (!publicKey) {
      console.log('missing --public-key')
      return
    }
    const results = await get_all_connection_credentials({ connection_type: 'ethereum', public_key: publicKey })
    if (!results.length) {
      console.log('no ethereum connections found')
      return
    }
    for (const { credentials } of results) {
      await run({ credentials, publicKey })
    }
  } catch (err) {
    console.log(err)
  }

  process.exit()
}

if (isMain(import.meta.url)) {
  main()
}

export default run
