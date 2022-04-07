import BigNumber from 'bignumber.js'

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
    .map((a) => a.asset_class)
    .toSet()
    .toList()
  return classes
}

export function getAssetsByClass(state, { asset_class }) {
  const assets = getAssets(state)
  return assets.filter((a) => a.asset_class === asset_class)
}

export function getAssetClassSummary(state, { asset_class }) {
  const assets = getAssetsByClass(state, { asset_class })
  const values = Object.values(assets.toJS())
  const balance = BigNumber.sum.apply(
    null,
    values.map((a) => a.balance)
  )
  return {
    symbol: asset_class,
    balance: balance.toNumber()
  }
}
