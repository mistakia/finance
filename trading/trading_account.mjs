import dayjs from 'dayjs'
import debug from 'debug'

import Holdings from './holdings.mjs'
import * as constants from './constants.mjs'

const log = debug('trading_account')
debug.enable('trading_account')

class Trading_Account {
  constructor(params) {
    this.name = params.name || 'Default Trading Account'
    this.Holdings = params.holdings || new Holdings()
    this.quote_queries = []
  }

  get summary() {
    return this.Holdings.summary
  }

  register_quote_query({ type, resolution, query_func, params }) {
    const quote_type = `${type}_${resolution}`
    this.quote_queries.push({ quote_type, query_func, params })
  }

  on_quote_data(quote_data) {
    // do nothing
  }
}

export class Option_Trading_Account extends Trading_Account {
  constructor(params) {
    super(params)

    this.SYMBOL = 'SPY'
    this.MAX_DELTA = params.max_delta || 0.3
    this.MIN_PREMIUM = params.min_premium || 0.3
    this.MAX_DTE = params.max_dte || 50
    this.MIN_DTE = params.min_dte || 21
    this.ENTRY_MIN_DAY_CHANGE = params.entry_min_day_change || 7
    this.ENTRY_MAX_PORTFOLIO_SIZE = params.entry_max_portfolio_size || 0.33
    this.MIN_DAYS_TO_EXPIRATION = params.min_days_to_expiration || 60

    this.last_entry = null

    this.register_quote_query({
      type: constants.HOLDING_TYPE.EQUITY,
      resolution: constants.RESOLUTION.DAY,
      params: { symbol: this.SYMBOL }
    })

    this.register_quote_query({
      type: constants.HOLDING_TYPE.OPTION,
      resolution: constants.RESOLUTION.DAY,
      params: { underlying_symbol: this.SYMBOL }
    })

    const quote_type = `${constants.HOLDING_TYPE.EQUITY}_${constants.RESOLUTION.DAY}`
    this.Holdings.register_equity({ symbol: this.SYMBOL, quote_type })
  }

  on_quote_data(quote_data) {
    // check if we have an option quote
    if (!quote_data.quote_type.includes(constants.HOLDING_TYPE.OPTION)) {
      return null
    }

    // check if we can sell a covered call
    this.sell_covered_call(quote_data)

    // check if we can sell a cash covered put
    this.sell_covered_put(quote_data)
  }

  sell_covered_call(quote_data) {
    // check if we have the underlying
    const holding_id = `${constants.HOLDING_TYPE.EQUITY}_${this.SYMBOL}`
    if (!this.Holdings.holdings[holding_id].quantity) {
      return null
    }

    // calculate the quantity of options we can sell
  }

  sell_covered_put(quote_data) {
    if (
      this.last_entry &&
      dayjs.unix(quote_data.quote_unixtime).diff(this.last_entry, 'day') <
        this.ENTRY_MIN_DAY_CHANGE
    ) {
      return null
    }

    // calculate amount of unused portfolio
    const { unallocation_cash } = this.Holdings

    const filtered_chain = quote_data.option_chain.filter((option) => {
      if (Math.abs(option.p_delta) > this.MAX_DELTA) {
        return false
      }

      if (option.dte < this.MIN_DTE || option.dte > this.MAX_DTE) {
        return false
      }

      return true
    })

    if (!filtered_chain.length) {
      const params = {
        max_delta: this.MAX_DELTA,
        min_dte: this.MIN_DTE,
        max_dte: this.MAX_DTE
      }
      log(`No options found for ${params} on ${quote_data.quote_date}`)
      return null
    }

    const sorted_chain = filtered_chain.sort((a, b) => {
      // sort by premium descending
      const first = b.p_bid - a.p_bid
      if (first) {
        return first
      }

      // sort by delta ascending
      return a.p_delta - b.p_delta
    })

    const selected_option = sorted_chain[0]
    if (!selected_option) {
      return null
    }

    // calculate the quantity of options that can be sold based on
    // the unallocated cash available using the option strike price and multiplier
    const cash_per_option = selected_option.strike * constants.OPTION_MULTIPLIER
    const max_quantity_unallocated = unallocation_cash / cash_per_option
    const max_quantity_entry_size =
      (this.ENTRY_MAX_PORTFOLIO_SIZE * this.Holdings.cash) / cash_per_option

    // calculate the quantity of options to sell by determining the min
    // between the max entry size and unallocated cash
    const quantity = Math.floor(
      Math.min(max_quantity_entry_size, max_quantity_unallocated)
    )

    // check if any options can be sold
    if (quantity <= 0) {
      // log(
      //   `No options can be sold max_quantity_entry_size: ${max_quantity_entry_size} max_quantity_unallocated: ${max_quantity_unallocated}`
      // )
      return null
    }

    this.Holdings.open_option({
      date: selected_option.quote_unixtime,
      quote_data: selected_option,
      quantity,
      option_type: constants.OPTION_TYPE.PUT,
      option_open_type: constants.OPTION_OPEN_TYPE.SHORT
    })

    this.last_entry = dayjs.unix(quote_data.quote_unixtime)
  }
}

export class Buy_And_Hold_Trading_Account extends Trading_Account {
  constructor(params) {
    super(params)

    this.SYMBOL = 'SPY'

    this.register_quote_query({
      type: constants.HOLDING_TYPE.EQUITY,
      resolution: constants.RESOLUTION.DAY,
      params: { symbol: this.SYMBOL }
    })

    const quote_type = `${constants.HOLDING_TYPE.EQUITY}_${constants.RESOLUTION.DAY}`
    this.Holdings.register_equity({ symbol: this.SYMBOL, quote_type })
  }

  on_quote_data(quote_data) {
    const holding_id = `${constants.HOLDING_TYPE.EQUITY}_${this.SYMBOL}`
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
      symbol: this.SYMBOL,
      quantity,
      price: quote_data.c,
      date: quote_data.quote_date,
      quote_type: quote_data.quote_type
    })
  }
}
