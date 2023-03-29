import Portfolio from './portfolio.mjs'
import * as constants from './constants.mjs'

class Trading_Strategy {
  constructor(params) {
    this.Portfolio = params.Portfolio || new Portfolio()
  }

  register_equity({ ticker, resolution } = {}) {
    if (!ticker) {
      throw new Error('Ticker is required')
    }

    if (!resolution) {
      throw new Error('Resolution is required')
    }

    this.Portfolio.register_equity({ ticker, resolution })
  }

  register_option({ ticker, resolution } = {}) {
    if (!ticker) {
      throw new Error('Ticker is required')
    }

    if (!resolution) {
      throw new Error('Resolution is required')
    }

    this.Portfolio.register_option({ ticker, resolution })
  }

  on_tick(data) {
    // do nothing
  }
}

export class Wheel_Strategy extends Trading_Strategy {
  constructor(params) {
    super(params)

    this.TICKER = 'SPY'
    this.MIN_DELTA = 0.3
    this.MIN_PREMIUM = 0.3

    this.register_equity({
      ticker: this.TICKER,
      resolution: constants.RESOLUTION.DAY_ADJUSTED
    })
    this.register_option({
      ticker: this.TICKER,
      resolution: constants.RESOLUTION.DAY
    })
  }

  on_tick(data) {
    // check if we can sell a covered call
    this.sell_covered_call(data)

    // check if we can sell a cash covered put
    this.sell_covered_put(data)
  }

  sell_covered_call(data) {
    // check if we have the underlying
    if (!this.Portfolio[this.TICKER].invested) {
      return
    }
  }

  sell_covered_put(data) {}
}
