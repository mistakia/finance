import debug from 'debug'
import BigNumber from 'bignumber.js'

import * as constants from './constants.mjs'
import { get_option_symbol } from '../libs-server/index.mjs'

const log = debug('holdings')
debug.enable('holdings')

export default class Holdings {
  constructor({ cash } = {}) {
    this.cash = cash
    this.start_value = cash
    this.holdings = {}
    this.transactions = []
  }

  get unallocation_cash() {
    let result = this.cash

    // subtract cash allocated to puts
    for (const holding_id in this.holdings) {
      const holding = this.holdings[holding_id]
      if (
        !holding.expired &&
        holding.holding_type === constants.HOLDING_TYPE.OPTION &&
        holding.option_type === constants.OPTION_TYPE.PUT
      ) {
        result -= BigNumber(holding.quantity)
          .multipliedBy(constants.OPTION_MULTIPLIER)
          .multipliedBy(holding.strike)
          .toNumber()
      }
    }

    return result
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
        if (holding.holding_type === constants.HOLDING_TYPE.EQUITY) {
          result += BigNumber(holding.latest_quote.c)
            .multipliedBy(holding.quantity)
            .toNumber()
        } else if (holding.holding_type === constants.HOLDING_TYPE.OPTION) {
          // TODO
        }
      }
    }

    return result
  }

  get summary() {
    const metrics = {
      start_value: this.start_value,
      end_value: this.total_value,
      return_pct: BigNumber(this.total_value)
        .minus(this.start_value)
        .dividedBy(this.start_value)
        .toNumber(),
      // max_drawdown
      transactions: this.transactions.length
      // win_transactions
      // loss_transactions
      // win_pct
      // avg_win_pct
      // avg_loss_pct
      // avg_win_loss_pct
      // cagr
    }

    return metrics
  }

  get status() {
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
        symbol: holding.symbol,
        quantity: holding.quantity
      }
    }

    return stats
  }

  register_equity({ symbol, quote_type } = {}) {
    if (!symbol) {
      throw new Error('Symbol is required')
    }

    if (!quote_type) {
      throw new Error('Quote type is required')
    }

    const holding_type = constants.HOLDING_TYPE.EQUITY
    const holding_id = `${holding_type}_${symbol}`

    if (this.holdings[holding_id]) {
      throw new Error(`Holding ${holding_id} already exists`)
    }

    this.holdings[holding_id] = {
      holding_type,
      symbol,
      quantity: 0,
      latest_quote: null,
      quote_type
    }
  }

  register_option({
    symbol,
    quote_type,
    option_type,
    option_open_type,
    underlying_symbol,
    strike,
    expire_unix,
    expire_quote
  } = {}) {
    if (!symbol) {
      throw new Error('Symbol is required')
    }

    if (!quote_type) {
      throw new Error('Quote type is required')
    }

    if (!option_type) {
      throw new Error('Option type is required')
    }

    if (!option_open_type) {
      throw new Error('Option open type is required')
    }

    if (!expire_unix) {
      throw new Error('Expire unix is required')
    }

    const holding_type = constants.HOLDING_TYPE.OPTION
    const holding_id = `${holding_type}_${symbol}`

    this.holdings[holding_id] = {
      quote_type,
      option_type,
      option_open_type,
      holding_type,
      symbol,
      underlying_symbol,
      quantity: 0,
      latest_quote: null,
      strike,
      expired: false,
      exercised: false,
      expire_unix,
      expire_quote
    }
  }

  buy_equity({ symbol, quantity, price, date, quote_type }) {
    if (!symbol) {
      throw new Error('Symbol is required')
    }

    if (!quantity) {
      throw new Error('Quantity is required')
    }

    if (!price) {
      throw new Error('Price is required')
    }

    if (!date) {
      throw new Error('Date is required')
    }

    if (!quote_type) {
      quote_type = `${constants.HOLDING_TYPE.EQUITY}_${constants.RESOLUTION.DAY}`
    }

    const holding_id = `${constants.HOLDING_TYPE.EQUITY}_${symbol}`
    const holding = this.holdings[holding_id]

    if (!holding) {
      this.register_equity({ symbol, quote_type })
    }

    if (this.cash < quantity * price) {
      throw new Error(`Not enough cash to buy ${quantity} shares of ${symbol}`)
    }

    this.cash -= BigNumber(quantity).multipliedBy(price).toNumber()
    holding.quantity += quantity

    this.transactions.push({
      date,
      holding_id,
      quantity,
      price,
      transaction_type: constants.TRANSACTION_TYPE.BUY_EQUITY
    })

    log(`Bought ${quantity} shares of ${symbol} at ${price} on ${date}`)
  }

  sell_equity({ symbol, quantity, price, date }) {
    if (!symbol) {
      throw new Error('Symbol is required')
    }

    if (!quantity) {
      throw new Error('Quantity is required')
    }

    if (!price) {
      throw new Error('Price is required')
    }

    if (!date) {
      throw new Error('Date is required')
    }

    const holding_id = `${constants.HOLDING_TYPE.EQUITY}_${symbol}`
    const holding = this.holdings[holding_id]

    if (!holding) {
      throw new Error(`Holding ${holding_id} does not exist`)
    }

    if (holding.quantity < quantity) {
      throw new Error(
        `Not enough shares of ${symbol} to sell ${quantity} shares`
      )
    }

    this.cash += BigNumber(quantity).multipliedBy(price).toNumber()
    holding.quantity -= quantity

    this.transactions.push({
      date,
      holding_id,
      quantity,
      price,
      transaction_type: constants.TRANSACTION_TYPE.SELL_EQUITY
    })

    log(`Sold ${quantity} shares of ${symbol} at ${price} on ${date}`)
  }

  open_option({ quote_data, quantity, option_type, option_open_type }) {
    if (!quote_data) {
      throw new Error('Quote data is required')
    }

    if (!quantity) {
      throw new Error('Quantity is required')
    }

    if (!option_type) {
      throw new Error('Option type is required')
    }

    if (!option_open_type) {
      throw new Error('Option open type is required')
    }

    const option_symbol = get_option_symbol({ option_type, ...quote_data })
    const holding_id = `${constants.HOLDING_TYPE.OPTION}_${option_symbol}`
    const holding = this.holdings[holding_id]

    if (!holding) {
      this.register_option({
        symbol: option_symbol,
        quote_type: quote_data.quote_type,
        option_type,
        option_open_type,
        underlying_symbol: quote_data.underlying_symbol,
        strike: quote_data.strike,
        expire_unix: quote_data.expire_unix,
        expire_quote: quote_data.expire_quote
      })
    }

    const get_price = () => {
      const id = `${option_open_type}_${option_type}`
      switch (id) {
        case 'LONG_CALL':
          return quote_data.c_ask

        case 'LONG_PUT':
          return quote_data.p_ask

        case 'SHORT_CALL':
          return quote_data.c_bid

        case 'SHORT_PUT':
          return quote_data.p_bid

        default:
          throw new Error(`Unknown open type ${id}`)
      }
    }

    const price = get_price()
    const premium = BigNumber(quantity)
      .multipliedBy(price)
      .multipliedBy(constants.OPTION_MULTIPLIER)
      .toNumber()
    if (option_open_type === constants.OPTION_OPEN_TYPE.LONG) {
      if (this.cash < premium) {
        throw new Error(
          `Not enough cash to open ${quantity} ${option_type} options of ${option_symbol}`
        )
      }

      this.cash -= premium
    } else if (option_open_type === constants.OPTION_OPEN_TYPE.SHORT) {
      // check if there is enough margin
      this.cash += premium
    }

    this.holdings[holding_id].quantity += quantity

    this.transactions.push({
      date: quote_data.quote_unixtime,
      holding_id,
      quantity,
      price,
      transaction_type: constants.TRANSACTION_TYPE.OPEN_OPTION
    })

    const log_params = {
      strike: quote_data.strike,
      expire_quote: quote_data.expire_quote,
      quote_date: quote_data.quote_date,
      expire_date: quote_data.expire_date,
      dte: quote_data.dte
    }
    log(
      `Opened ${quantity} ${option_type} options of ${option_symbol} at ${price}:`,
      log_params
    )
  }

  close_option({ quote_data, quantity, option_type, option_close_type }) {}

  exercise_option({ holding_id, date }) {
    const holding = this.holdings[holding_id]
    if (!holding) {
      throw new Error(`Holding ${holding_id} does not exist`)
    }

    if (holding.holding_type !== constants.HOLDING_TYPE.OPTION) {
      throw new Error(`Holding ${holding_id} is not an option`)
    }

    if (holding.expired) {
      throw new Error(`Holding ${holding_id} has expired`)
    }

    if (!holding.quantity) {
      throw new Error(`Holding ${holding_id} has no quantity`)
    }

    log(`Exercising ${holding_id} on ${date}`)

    if (holding.option_open_type === constants.OPTION_OPEN_TYPE.SHORT) {
      if (holding.option_type === constants.OPTION_TYPE.CALL) {
        this.sell_equity({
          symbol: holding.underlying_symbol,
          quantity: BigNumber(holding.quantity)
            .multipliedBy(constants.OPTION_MULTIPLIER)
            .toNumber(),
          price: holding.strike,
          date
        })
      } else if (holding.option_type === constants.OPTION_TYPE.PUT) {
        this.buy_equity({
          symbol: holding.underlying_symbol,
          quantity: BigNumber(holding.quantity)
            .multipliedBy(constants.OPTION_MULTIPLIER)
            .toNumber(),
          price: holding.strike,
          date
        })
      }
    } else if (holding.option_open_type === constants.OPTION_OPEN_TYPE.LONG) {
      if (holding.option_type === constants.OPTION_TYPE.CALL) {
        this.buy_equity({
          symbol: holding.underlying_symbol,
          quantity: BigNumber(holding.quantity)
            .multipliedBy(constants.OPTION_MULTIPLIER)
            .toNumber(),
          price: holding.strike,
          date
        })
      } else if (holding.option_type === constants.OPTION_TYPE.PUT) {
        this.sell_equity({
          symbol: holding.underlying_symbol,
          quantity: BigNumber(holding.quantity)
            .multipliedBy(constants.OPTION_MULTIPLIER)
            .toNumber(),
          price: holding.strike,
          date
        })
      }
    }

    holding.exercised = true
  }
}
