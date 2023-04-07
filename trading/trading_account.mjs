import Holdings from './holdings.mjs'
import * as constants from './constants.mjs'

class Trading_Account {
  constructor(params) {
    this.name = params.name || 'Default Trading Account'
    this.Holdings = params.holdings || new Holdings()
  }

  stats() {
    return this.Holdings.stats()
  }

  register_equity({ ticker, resolution } = {}) {
    if (!ticker) {
      throw new Error('Ticker is required')
    }

    if (!resolution) {
      throw new Error('Resolution is required')
    }

    this.Holdings.register_equity({ ticker, resolution })
  }

  register_option({ ticker, resolution } = {}) {
    if (!ticker) {
      throw new Error('Ticker is required')
    }

    if (!resolution) {
      throw new Error('Resolution is required')
    }

    this.Holdings.register_option({ ticker, resolution })
  }

  on_quote_data(quote_data) {
    // do nothing
  }
}

export class Wheel_Trading_Account extends Trading_Account {
  constructor(params) {
    super(params)

    this.TICKER = 'SPY'
    this.MIN_DELTA = 0.3
    this.MIN_PREMIUM = 0.3

    this.register_equity({
      ticker: this.TICKER,
      resolution: constants.RESOLUTION.DAY
    })
    this.register_option({
      ticker: this.TICKER,
      resolution: constants.RESOLUTION.DAY
    })
  }

  on_quote_data(quote_data) {
    // check if we can sell a covered call
    this.sell_covered_call(quote_data)

    // check if we can sell a cash covered put
    this.sell_covered_put(quote_data)
  }

  sell_covered_call(quote_data) {
    // check if we have the underlying
    const holding_id = `${constants.HOLDING_TYPE.EQUITY}_${this.TICKER}`
    if (!this.Holdings.holdings[holding_id].quantity) {
      return null
    }
  }

  sell_covered_put(quote_data) {}
}

export class Buy_And_Hold_Trading_Account extends Trading_Account {
  constructor(params) {
    super(params)

    this.TICKER = 'SPY'

    this.register_equity({
      ticker: this.TICKER,
      resolution: constants.RESOLUTION.DAY
    })
  }

  on_quote_data(quote_data) {
    const holding_id = `${constants.HOLDING_TYPE.EQUITY}_${this.TICKER}`
    if (this.Holdings.holdings[holding_id].quantity > 0) {
      return
    }

    if (
      quote_data.quote_type !==
      `${constants.HOLDING_TYPE.EQUITY}_${constants.RESOLUTION.DAY}`
    ) {
      return
    }

    const quantity = Math.floor(this.Holdings.cash / quote_data.c)
    this.Holdings.buy_equity({
      ticker: this.TICKER,
      quantity,
      price: quote_data.c,
      date: quote_data.quote_date
    })
  }
}
