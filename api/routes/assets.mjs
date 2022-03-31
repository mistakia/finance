import express from 'express'

const router = express.Router()

router.get('/:publicKey', async (req, res) => {
  const { log, db } = req.app.locals
  try {
    const { publicKey } = req.params
    const holdings = await db('holdings').where(
      'link',
      'like',
      `%${publicKey}%`
    )
    const asset_links = holdings.map((i) => i.asset_link)
    const uniq_links = new Set(asset_links.filter(i => Boolean(i)))
    if (!uniq_links.size) {
      return res.status(200).send([])
    }

    const assets = await db('assets').whereIn('link', [...uniq_links])
    const items = []
    for (const asset of assets) {
      const matches = holdings.filter((i) => i.asset_link === asset.link)
      items.push({
        holdings: matches,
        ...asset
      })
    }
    res.status(200).send(items)
  } catch (err) {
    log(err)
    res.status(500).send({ error: err.toString() })
  }
})

export default router
