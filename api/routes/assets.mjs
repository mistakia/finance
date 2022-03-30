import express from 'express'

const router = express.Router()

router.get('/:publicKey', async (req, res) => {
  const { log, db } = req.app.locals
  try {
    const { publicKey } = req.params
    const assets = await db('assets').where('link', 'like', `%${publicKey}%`)
    res.status(200).send(assets)
  } catch (err) {
    log(err)
    res.status(500).send({ error: err.toString() })
  }
})

export default router
