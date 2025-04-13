import db from '#db'
import getAssetInfo from './get-asset-info.mjs'
import getType from './get-type.mjs'

export default async function ({ asset_type, symbol, update = false }) {
  if (!asset_type) {
    asset_type = await getType({ symbol })
  }

  if (!asset_type) {
    throw new Error('missing asset type')
  }

  const exists = await db('assets').where({
    asset_type,
    symbol
  })

  if (exists.length && !update) {
    return exists[0]
  }

  const asset = await getAssetInfo({ asset_type, symbol })
  await db('assets').insert(asset).onConflict().merge()

  return asset
}
