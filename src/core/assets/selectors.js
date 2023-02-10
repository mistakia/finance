import BigNumber from 'bignumber.js'
import { Asset } from './asset.js'

export function getAssets(state) {
  return state.get('assets')
}

export function getAssetsBalance(state) {
  const assets = getAssets(state)
  const values = Object.values(assets.toJS())
  const balance = BigNumber.sum.apply(
    null,
    values.map((a) => a.balance)
  )

  return balance.toNumber()
}

export function getAssetClasses(state) {
  const assets = getAssets(state)
  const classes = assets
    .map((a) => a.asset_class.substring(1).split('/')[0])
    .map((a) => `/${a}`)
    .toSet()
    .toList()

  return classes
    .map((asset_class) => {
      const balance = assets
        .filter((a) => a.asset_class.includes(asset_class))
        .map((a) => a.quantity * a.market_value_usd)
        .reduce((sum, a) => sum + a, 0)

      return {
        balance,
        asset_class
      }
    })
    .sort((a, b) => b.balance - a.balance)
    .map((a) => a.asset_class)
}

export function getAssetClassesByAssetClass(state, { asset_class }) {
  const assets = getAssetsByClass(state, { asset_class })
  const classes = assets
    .map((a) => a.asset_class.split(asset_class)[1])
    .filter((a) => a !== '/')
    .map((a) => `${asset_class}${a}`)
    .filter((a) => a !== asset_class)
    .toSet()
    .toList()

  return classes
}

export function getAssetsByClass(state, { asset_class }) {
  const assets = getAssets(state)
  return assets.filter((a) => a.asset_class.startsWith(asset_class))
}

export function getAssetClassSummary(state, { asset_class }) {
  const assets = getAssetsByClass(state, { asset_class })
  const values = Object.values(assets.toJS())
  const balance = BigNumber.sum.apply(
    null,
    values.map((a) => a.balance)
  )

  return new Asset({
    symbol: asset_class,
    balance: balance.toNumber()
  })
}
