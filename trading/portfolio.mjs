import * as constants from './constants.mjs'

export default class Portfolio {
  constructor({ cash } = {}) {
    this.cash = cash
    this.holdings = {}
  }

  register_holding({ holding_type, ticker, resolution } = {}) {
    if (!holding_type) {
      throw new Error('Holding type is required')
    }

    if (!ticker) {
      throw new Error('Ticker is required')
    }

    if (!resolution) {
      throw new Error('Resolution is required')
    }

    const holding_id = `${holding_type}_${ticker}`

    if (this.holdings[holding_id]) {
      throw new Error(`Holding ${holding_id} already exists`)
    }

    this.holdings[holding_id] = { holding_type, ticker, resolution }
  }

  register_equity({ ticker, resolution } = {}) {
    if (!ticker) {
      throw new Error('Ticker is required')
    }

    if (!resolution) {
      throw new Error('Resolution is required')
    }

    this.holdings.push({
      holding_type: constants.HOLDING_TYPE.EQUITY,
      ticker,
      resolution
    })
  }

  register_option({ ticker, resolution } = {}) {
    if (!ticker) {
      throw new Error('Ticker is required')
    }

    if (!resolution) {
      throw new Error('Resolution is required')
    }

    this.holdings.push({
      holding_type: constants.HOLDING_TYPE.OPTION,
      ticker,
      resolution
    })
  }
}
