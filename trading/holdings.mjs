import * as constants from './constants.mjs'
import debug from 'debug'

const log = debug('holdings')
debug.enable('holdings')

export default class Holdings {
  constructor({ cash } = {}) {
    this.cash = cash
    this.holdings = {}
    this.transactions = []
  }

  get unrealized_gains() {
    // let unrealized_gains = 0
    // for (const holding_id in this.holdings) {
    //   const holding = this.holdings[holding_id]
    // }

    return null
  }

  get total_value() {
    let result = this.cash
    for (const holding_id in this.holdings) {
      const holding = this.holdings[holding_id]
      if (holding.latest_quote) {
        result += holding.latest_quote.c * holding.quantity
      }
    }

    return result
  }

  stats() {
    const stats = {
      cash: this.cash,
      total_value: this.total_value,
      // unrealized_gains: this.unrealized_gains(),
      holdings: {}
    }

    for (const holding_id in this.holdings) {
      const holding = this.holdings[holding_id]
      stats.holdings[holding_id] = {
        holding_type: holding.holding_type,
        ticker: holding.ticker,
        resolution: holding.resolution,
        quantity: holding.quantity
      }
    }

    return stats
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

    const quote_type = `${holding_type}_${resolution}`
    this.holdings[holding_id] = {
      quote_type,
      holding_type,
      ticker,
      resolution,
      quantity: 0,
      latest_quote: null
    }
  }

  register_equity({ ticker, resolution } = {}) {
    if (!ticker) {
      throw new Error('Ticker is required')
    }

    if (!resolution) {
      throw new Error('Resolution is required')
    }

    this.register_holding({
      holding_type: constants.HOLDING_TYPE.EQUITY,
      ticker,
      resolution
    })
  }

  buy_equity({ ticker, quantity, price, date }) {
    if (!ticker) {
      throw new Error('Ticker is required')
    }

    if (!quantity) {
      throw new Error('Quantity is required')
    }

    if (!price) {
      throw new Error('Price is required')
    }

    const holding_id = `${constants.HOLDING_TYPE.EQUITY}_${ticker}`
    const holding = this.holdings[holding_id]

    if (!holding) {
      throw new Error(`Holding ${holding_id} does not exist`)
    }

    if (this.cash < quantity * price) {
      throw new Error(`Not enough cash to buy ${quantity} shares of ${ticker}`)
    }

    this.cash -= quantity * price
    holding.quantity += quantity

    this.transactions.push({
      date,
      holding_id,
      quantity,
      price,
      transaction_type: constants.TRANSACTION_TYPE.BUY_EQUITY
    })

    log(`Bought ${quantity} shares of ${ticker} at ${price} on ${date}`)
  }

  register_option({ ticker, resolution } = {}) {
    if (!ticker) {
      throw new Error('Ticker is required')
    }

    if (!resolution) {
      throw new Error('Resolution is required')
    }

    this.register_holding({
      holding_type: constants.HOLDING_TYPE.OPTION,
      ticker,
      resolution
    })
  }
}
