import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import { isMain, solana } from '#libs-shared'
import { get_all_connection_credentials } from './get-connection-credentials.mjs'
import {
  parse_transactions,
  parse_staking_rewards
} from '../libs-server/parsers/solana.mjs'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-solana-transactions')
debug.enable('import-solana-transactions')

const run = async ({ credentials, publicKey }) => {
  const address = credentials.address
  const all_transactions = []

  // Transaction history via Helius Enhanced API
  const txs = await solana.getTransactions({ address })
  if (txs.length) {
    log(`Fetched ${txs.length} transactions for ${address}`)
    const parsed = parse_transactions({
      data: txs,
      owner: publicKey,
      address
    })
    all_transactions.push(...parsed)
  }

  // Staking rewards
  const stake_accounts = await solana.getStakeAccounts({ address })
  if (stake_accounts.length) {
    log(`Found ${stake_accounts.length} stake accounts`)
    for (const account of stake_accounts) {
      const stake_address = account.pubkey
      const rewards = await solana.getStakingRewards({
        stakeAccount: stake_address,
        startEpoch: 400,
        endEpoch: 700
      })
      if (rewards.length) {
        log(`Fetched ${rewards.length} staking rewards for ${stake_address}`)
        const parsed = parse_staking_rewards({
          data: rewards,
          owner: publicKey,
          address: stake_address
        })
        all_transactions.push(...parsed)
      }
    }
  }

  if (!all_transactions.length) {
    log('no transactions found')
    return
  }

  await db('transactions')
    .insert(all_transactions)
    .onConflict('link')
    .merge()
  log(`Inserted ${all_transactions.length} solana transactions`)
}

const main = async () => {
  try {
    const publicKey = argv.publicKey
    if (!publicKey) {
      console.log('missing --public-key')
      return
    }
    const results = await get_all_connection_credentials({
      connection_type: 'solana',
      public_key: publicKey
    })
    if (!results.length) {
      console.log('no solana connections found')
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
