import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import { isMain, ethereum } from '#libs-shared'
import { get_connection_credentials } from './get-connection-credentials.mjs'
import { parse_transactions, parse_token_transactions } from '../libs-server/parsers/ethereum.mjs'

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
    const result = await get_connection_credentials({ connection_type: 'ethereum', public_key: publicKey })
    const { credentials } = result
    await run({ credentials, publicKey })
  } catch (err) {
    console.log(err)
  }

  process.exit()
}

if (isMain(import.meta.url)) {
  main()
}

export default run
