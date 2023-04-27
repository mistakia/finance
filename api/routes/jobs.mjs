import express from 'express'

import { send } from '#root/api/websocket.mjs'
import importRobinhoodAccounts from '#scripts/import-robinhood-accounts.mjs'
import importAllyBankAccounts from '#scripts/import-ally-bank-accounts.mjs'
import importAllyInvestAccounts from '#scripts/import-ally-invest-accounts.mjs'
import importPeerstreetAccounts from '#scripts/import-peerstreet-accounts.mjs'
import importGeminiAccounts from '#scripts/import-gemini-accounts.mjs'
import importBitcoinAccounts from '#scripts/import-bitcoin-accounts.mjs'
import importNanoAccounts from '#scripts/import-nano-accounts.mjs'
import importEthereumAccounts from '#scripts/import-ethereum-accounts.mjs'
import importWealthfrontAccounts from '#scripts/import-wealthfront-accounts.mjs'
import importGroundfloorAccounts from '#scripts/import-groundfloor-accounts.mjs'
import importSchwabAccounts from '#scripts/import-schwab-accounts.mjs'
import importStellarAccounts from '#scripts/import-stellar-accounts.mjs'
import importLitecoinAccount from '#scripts/import-litecoin-account.mjs'
import import_interactive_brokers_accounts from '#scripts/import-interactive-brokers-accounts.mjs'

export const jobs = {
  'robinhood/accounts': importRobinhoodAccounts,
  'ally-bank/accounts': importAllyBankAccounts,
  'ally-invest/accounts': importAllyInvestAccounts,
  'peerstreet/accounts': importPeerstreetAccounts,
  'gemini/accounts': importGeminiAccounts,
  'bitcoin/accounts': importBitcoinAccounts,
  'nano/accounts': importNanoAccounts,
  'ethereum/accounts': importEthereumAccounts,
  'wealthfront/accounts': importWealthfrontAccounts,
  'groundfloor/accounts': importGroundfloorAccounts,
  'schwab/accounts': importSchwabAccounts,
  'stellar/accounts': importStellarAccounts,
  'litecoin/account': importLitecoinAccount,
  'interactive_brokers/accounts': import_interactive_brokers_accounts
}

const run = async ({ id, publicKey, connection, credentials, session }) => {
  const errors = []
  for (const job_id of connection.jobs) {
    try {
      const job = jobs[job_id]
      const res = await job({ credentials, session, publicKey })
      const event = {
        type: 'SET_CONNECTION_SESSION',
        payload: {
          id,
          session: res
        }
      }
      send({ publicKey, event })
    } catch (error) {
      errors.push(error)
      console.log(error)
    }
  }

  const event = {
    type: 'SET_CONNECTION_LAST_CONNECTION',
    payload: {
      id,
      errors
    }
  }
  send({ publicKey, event })
}

const router = express.Router()

router.post('/', async (req, res) => {
  const { queue, log } = req.app.locals
  try {
    const { id, session, connection, credentials, publicKey } = req.body
    queue.add(() => run({ id, session, connection, credentials, publicKey }))
    res.status(200).send({ success: true })
  } catch (err) {
    log(err)
    res.status(500).send({ error: err.toString() })
  }
})

export default router
