import express from 'express'

import { send } from '#root/api/websocket.mjs'
import importRobinhoodAccounts from '#scripts/import-robinhood-accounts.mjs'
import importAllyBankAccounts from '#scripts/import-ally-bank-accounts.mjs'
import importAllyInvestAccounts from '#scripts/import-ally-invest-accounts.mjs'

export const jobs = {
  'robinhood/accounts': importRobinhoodAccounts,
  'ally-bank/accounts': importAllyBankAccounts,
  'ally-invest/accounts': importAllyInvestAccounts
}

const run = async ({ id, publicKey, connection, credentials, session }) => {
  for (const job_id of connection.jobs) {
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
  }

  const event = {
    type: 'SET_CONNECTION_LAST_CONNECTION',
    payload: {
      id
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
