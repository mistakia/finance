import db from '#db'
import getAssetInfo from './get-asset-info.mjs'

export default async function ({ type, symbol }) {
  const exists = await db('assets').where({
    type,
    symbol
  })

  if (exists.length) {
    return exists[0]
  }

  const asset = await getAssetInfo({ type, symbol })
  await db('assets').insert(asset).onConflict().merge()

  return asset
}
