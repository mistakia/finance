import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import { isMain, binanceUs } from '#libs-shared'
import { get_connection_credentials } from './get-connection-credentials.mjs'
import {
  parse_trades,
  parse_deposits,
  parse_withdrawals,
  parse_staking_rewards
} from '../libs-server/parsers/binance-us.mjs'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-binance-us-transactions')
debug.enable('import-binance-us-transactions')

const COMMON_QUOTES = ['USD', 'USDT', 'BUSD', 'BTC', 'ETH', 'BNB']

const run = async ({ credentials, publicKey }) => {
  const all_transactions = []

  // Get account to discover traded symbols
  const account = await binanceUs.getAccount({ ...credentials })
  const symbols_with_balance = (account.balances || [])
    .filter((b) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
    .map((b) => b.asset)

  // Build trading pairs from symbols with balances
  const pairs = []
  for (const symbol of symbols_with_balance) {
    for (const quote of COMMON_QUOTES) {
      if (symbol !== quote) {
        pairs.push(`${symbol}${quote}`)
      }
    }
  }

  // Trades per symbol pair
  for (const symbol of pairs) {
    const trades = await binanceUs.getMyTrades({ ...credentials, symbol })
    if (trades.length) {
      log(`Fetched ${trades.length} trades for ${symbol}`)
      const parsed = parse_trades({ data: trades, owner: publicKey })
      all_transactions.push(...parsed)
    }
  }

  // Deposits
  const deposits = await binanceUs.getDeposits({ ...credentials })
  if (deposits.length) {
    log(`Fetched ${deposits.length} deposits`)
    const parsed = parse_deposits({ data: deposits, owner: publicKey })
    all_transactions.push(...parsed)
  }

  // Withdrawals
  const withdrawals = await binanceUs.getWithdrawals({ ...credentials })
  if (withdrawals.length) {
    log(`Fetched ${withdrawals.length} withdrawals`)
    const parsed = parse_withdrawals({ data: withdrawals, owner: publicKey })
    all_transactions.push(...parsed)
  }

  // Staking rewards (both STAKING and SAVINGS)
  for (const product of ['STAKING', 'SAVINGS']) {
    const rewards = await binanceUs.getStakingRewards({
      ...credentials,
      product
    })
    if (rewards.length) {
      log(`Fetched ${rewards.length} ${product} rewards`)
      const parsed = parse_staking_rewards({ data: rewards, owner: publicKey })
      all_transactions.push(...parsed)
    }
  }

  // Distributions (airdrops, rebates)
  const distributions = await binanceUs.getDistributions({ ...credentials })
  if (distributions.length) {
    log(`Fetched ${distributions.length} distributions`)
    const parsed = parse_staking_rewards({
      data: distributions,
      owner: publicKey
    })
    all_transactions.push(...parsed)
  }

  if (!all_transactions.length) {
    log('no transactions found')
    return
  }

  await db('transactions')
    .insert(all_transactions)
    .onConflict('link')
    .merge()
  log(`Inserted ${all_transactions.length} binance-us transactions`)
}

const main = async () => {
  try {
    const publicKey = argv.publicKey
    if (!publicKey) {
      console.log('missing --public-key')
      return
    }
    const result = await get_connection_credentials({
      connection_type: 'binance-us',
      public_key: publicKey
    })
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
