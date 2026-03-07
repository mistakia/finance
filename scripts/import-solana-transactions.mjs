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

const insert_transactions = async (transactions) => {
  if (!transactions.length) return
  await db('transactions')
    .insert(transactions)
    .onConflict('link')
    .merge()
}

const run = async ({ credentials, publicKey }) => {
  const address = credentials.address.split('/')[0]

  // Transaction history via Helius Enhanced API
  const txs = await solana.getTransactions({ address })
  if (txs.length) {
    log(`Fetched ${txs.length} transactions for ${address}`)
    const parsed = parse_transactions({
      data: txs,
      owner: publicKey,
      address
    })
    if (parsed.length) {
      await insert_transactions(parsed)
      log(`Inserted ${parsed.length} transactions`)
    }
  }

  // Staking rewards
  const stake_accounts = await solana.getStakeAccounts({ address })
  if (stake_accounts.length) {
    log(`Found ${stake_accounts.length} stake accounts`)
    const epoch_info = await solana.getEpochInfo()
    const current_epoch = epoch_info.epoch
    log(`Current epoch: ${current_epoch}`)
    for (const account of stake_accounts) {
      const stake_address = account.pubkey
      const activation_epoch = parseInt(
        account.account?.data?.parsed?.info?.stake?.delegation
          ?.activationEpoch || '0',
        10
      )
      const start_epoch = activation_epoch || Math.max(0, current_epoch - 300)
      log(`Stake ${stake_address}: fetching rewards from epoch ${start_epoch} to ${current_epoch}`)
      try {
        const rewards = await solana.getStakingRewards({
          stakeAccount: stake_address,
          startEpoch: start_epoch,
          endEpoch: current_epoch
        })
        if (rewards.length) {
          log(`Fetched ${rewards.length} staking rewards for ${stake_address}`)
          const parsed = parse_staking_rewards({
            data: rewards,
            owner: publicKey,
            address: stake_address
          })
          await insert_transactions(parsed)
          log(`Inserted ${parsed.length} staking rewards`)
        }
      } catch (err) {
        log(`Error fetching staking rewards for ${stake_address}: ${err.message}`)
      }
    }
  }
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
