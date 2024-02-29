import db from '#db'
import getAssetInfo from './get-asset-info.mjs'
import getType from './get-type.mjs'

export default async function ({ type, symbol, update = false }) {
  if (!type) {
    type = await getType({ symbol })
  }

  if (!type) {
    throw new Error('missing asset type')
  }

  const exists = await db('assets').where({
    type,
    symbol
  })

  if (exists.length && !update) {
    return exists[0]
  }

  const asset = await getAssetInfo({ type, symbol })
  await db('assets').insert(asset).onConflict().merge()

  return asset
}
