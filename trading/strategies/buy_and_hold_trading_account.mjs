import debug from 'debug'

import { Trading_Account } from '../trading_account.mjs'
import * as constants from '../constants.mjs'

const log = debug('buy_and_hold_trading_account')

export default class Buy_And_Hold_Trading_Account extends Trading_Account {
  constructor(params) {
    super(params)

    this.SYMBOL = 'SPY'
    log('Initializing Buy_And_Hold_Trading_Account with params:', params)

    // TODO - limit entry to min day change
    // this.ENTRY_MIN_DAY_CHANGE = params.entry_min_day_change || 7

    // TODO - limit entry to max portion of portfolio
    // this.ENTRY_MAX_PORTFOLIO_SIZE = params.entry_max_portfolio_size || 0.33

    // TODO - limit entry to days of month
    // TODO - limit entry to days of week

    this.register_quote_query({
      type: constants.HOLDING_TYPE.EQUITY,
      resolution: constants.RESOLUTION.DAY,
      query_params: { symbol: this.SYMBOL }
    })
    log('Registered quote query for symbol:', this.SYMBOL)

    const quote_type = `${constants.HOLDING_TYPE.EQUITY}_${constants.RESOLUTION.DAY}`
    this.Holdings.register_equity({ symbol: this.SYMBOL, quote_type })
    log('Registered equity holding for symbol:', this.SYMBOL)
  }

  on_quote_data(quote_data) {
    log('Received quote data:', quote_data)
    const holding_id = `${constants.HOLDING_TYPE.EQUITY}_${this.SYMBOL}`
    if (this.Holdings.holdings[holding_id].quantity > 0) {
      log('Holding already exists for:', holding_id)
      return
    }

    if (
      quote_data.quote_type !==
      `${constants.HOLDING_TYPE.EQUITY}_${constants.RESOLUTION.DAY}`
    ) {
      log('Quote type does not match for:', quote_data.quote_type)
      return
    }

    const quantity = Math.floor(this.Holdings.cash / quote_data.c)
    log('Calculated quantity to buy:', quantity)
    this.Holdings.buy_equity({
      symbol: this.SYMBOL,
      quantity,
      price: quote_data.c,
      date: quote_data.quote_date,
      quote_type: quote_data.quote_type
    })
    log('Executed buy equity for symbol:', this.SYMBOL, 'quantity:', quantity)
  }
}
