import { Record, List } from 'immutable'
import BigNumber from 'bignumber.js'

export const Asset = new Record({
  holdings: new List(),
  link: null,
  symbol: null,
  market_value_usd: null,
  asset_class: null,

  balance: null,
  quantity: null,
  cost_basis: null
})

export function createAsset(data) {
  const { link, holdings, market_value_usd, asset_class, symbol } = data

  const quantity = BigNumber.sum.apply(
    null,
    holdings.map((h) => h.quantity)
  )
  const cost_basis = BigNumber.sum.apply(
    null,
    holdings.map((h) => h.cost_basis)
  )
  const balance = quantity.multipliedBy(market_value_usd)

  return new Asset({
    holdings: new List(holdings),
    link,
    symbol,
    market_value_usd,
    asset_class,

    balance: balance.toNumber(),
    quantity: quantity.toNumber(),
    cost_basis: cost_basis.toNumber()
  })
}
