import express from 'express'

import importRobinhoodAccounts from '../../scripts/import-robinhood-accounts.mjs'

export const jobs = {
  'robinhood/accounts': importRobinhoodAccounts
}

const run = async ({ connection, params }) => {
  for (const job_id of connection.jobs) {
    const job = jobs[job_id]
    // await job(params)
  }

  console.log('job done')
  // send ws message to update client state
}

const router = express.Router()

router.post('/', async (req, res) => {
  const { queue, log } = req.app.locals
  try {
    const { connection, params } = req.body
    queue.add(() => run({ connection, params }))
    res.status(200).send({ success: true })
  } catch (err) {
    log(err)
    res.status(500).send({ error: err.toString() })
  }
})

export default router
