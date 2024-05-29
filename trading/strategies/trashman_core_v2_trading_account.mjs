import dayjs from 'dayjs'
import { RSI, SMA, ROC } from '@debut/indicators'
import debug from 'debug'

import { MaxDrawdown } from '#libs-server'
import db from '#db'
import { Trading_Account } from '../trading_account.mjs'
import * as constants from '../constants.mjs'
import import_historical_prices_yahoo from '#scripts/import-historical-prices-yahoo.mjs'

const log = debug('trashman_core_v2_trading_account')
const trade_info_log = debug('trashman_core_v2_trading_account:trade_info')

export default class Trashman_Core_V2_Trading_Account extends Trading_Account {
  constructor(params) {
    super(params)
    log('Initializing Trashman_Core_V2_Trading_Account with params:', params)

    this.indicator_symbols = ['TQQQ', 'SPY', 'BND', 'IEF', 'TLT', 'QQQ', 'TMF']
    this.holding_symbols = [
      'TQQQ',
      'UVXY',
      'SOXL',
      'TMF',
      'TLT',
      'IEF',
      'BIL',
      'SPY',
      'BND',
      'QQQ'
    ]
    this.rebalance_frequency = 'daily'
    this.tqqq_rsi_overbought_threshold = 76
    this.tqqq_rsi_oversold_threshold = 32

    this.latest_quotes = {
      TQQQ: null,
      UVXY: null,
      SOXL: null,
      TMF: null,
      TLT: null,
      IEF: null,
      BIL: null,
      SPY: null,
      BND: null,
      QQQ: null
    }

    this.indicator_symbols.concat(this.holding_symbols).forEach((symbol) => {
      this.register_quote_query({
        type: constants.HOLDING_TYPE.EQUITY,
        resolution: constants.RESOLUTION.DAY,
        query_params: { symbol }
      })
    })

    this.holding_symbols.forEach((symbol) => {
      const quote_type = `${constants.HOLDING_TYPE.EQUITY}_${constants.RESOLUTION.DAY}`
      this.Holdings.register_equity({ symbol, quote_type })
    })
  }

  async init(start_date = dayjs().format('YYYY-MM-DD')) {
    log(
      `Initializing historical quotes and indicators starting from ${start_date}`
    )
    await this.load_historical_quotes(start_date)
    this.init_indicators()
  }

  async import_historical_quotes() {
    log('Importing historical quotes')

    for (const symbol of this.indicator_symbols) {
      const last_entry = await db('eod_equity_quotes')
        .where('symbol', symbol)
        .orderBy('quote_date', 'desc')
        .first()

      let start_year
      if (last_entry) {
        const last_entry_date = dayjs(last_entry.quote_date)
        const current_date = dayjs()
        const market_close_time = current_date.hour(16).minute(0).second(0)

        const last_market_day =
          current_date.day() === 0
            ? current_date.subtract(2, 'day').format('YYYY-MM-DD')
            : current_date.day() === 6
            ? current_date.subtract(1, 'day').format('YYYY-MM-DD')
            : current_date.isAfter(market_close_time)
            ? current_date.format('YYYY-MM-DD')
            : current_date.day() === 1
            ? current_date.subtract(3, 'day').format('YYYY-MM-DD')
            : current_date.subtract(1, 'day').format('YYYY-MM-DD')

        const is_up_to_date_or_newer =
          last_entry_date.isSameOrAfter(dayjs(last_market_day), 'day')

        if (is_up_to_date_or_newer) {
          log(`Latest quote for ${symbol} is up to date or newer. Skipping import.`)
          continue
        }

        log(
          `Last entry ${last_entry_date.format(
            'YYYY-MM-DD'
          )} does not match or is before last market day ${last_market_day}`
        )

        start_year = last_entry_date.year()
        log(`Last entry for ${symbol} found, starting from year: ${start_year}`)
      } else {
        start_year = dayjs().subtract(1, 'year').startOf('year').year()
        log(
          `No last entry for ${symbol} found, starting from year: ${start_year}`
        )
      }

      log(
        `Importing historical prices for ${symbol} starting from ${start_year}`
      )
      await import_historical_prices_yahoo({ symbol, startYear: start_year })
    }
  }

  async load_historical_quotes(start_date = dayjs().format('YYYY-MM-DD')) {
    log('Loading historical quotes from the database')

    const indicator_windows = {
      TQQQ: 300,
      SPY: 300,
      BND: 300,
      IEF: 300,
      TLT: 300,
      QQQ: 300,
      TMF: 300
    }

    const quotes = {}

    for (const symbol of this.indicator_symbols) {
      const max_window = indicator_windows[symbol]
      const result = await db('eod_equity_quotes')
        .where('symbol', symbol)
        .andWhere('quote_date', '<=', start_date)
        .orderBy('quote_unixtime', 'desc')
        .limit(max_window)

      quotes[symbol] = result.sort(
        (a, b) => a.quote_unixtime - b.quote_unixtime
      )
    }

    this.historical_quotes = quotes
    log('Historical quotes loaded for each symbol')
  }

  init_indicators() {
    log('Initializing indicators')
    this.indicators = {
      tqqq_rsi_10: new RSI(10),
      tqqq_cum_return_6: new ROC(6),
      tqqq_cum_return_1: new ROC(1),
      tmf_max_drawdown_10: new MaxDrawdown(10),
      qqq_max_drawdown_10: new MaxDrawdown(10),
      qqq_moving_avg_25: new SMA(25),
      spy_rsi_60: new RSI(60),
      bnd_rsi_45: new RSI(45),
      ief_rsi_200: new RSI(200),
      tlt_rsi_200: new RSI(200)
    }

    this.indicator_values = {}

    // Process historical quotes to initialize indicator values
    for (const symbol in this.historical_quotes) {
      this.historical_quotes[symbol].forEach((quote) => {
        const close_price = quote.c
        const indicator_suffixes = [
          '_rsi_10',
          '_cum_return_6',
          '_cum_return_1',
          '_max_drawdown_10',
          '_moving_avg_25',
          '_rsi_60',
          '_rsi_45',
          '_rsi_200'
        ]

        indicator_suffixes.forEach((indicator_suffix) => {
          const indicator_key = `${symbol.toLowerCase()}${indicator_suffix}`
          if (this.indicators[indicator_key]) {
            this.indicator_values[indicator_key] =
              this.indicators[indicator_key].nextValue(close_price)
          }
        })
      })
    }
    log('Indicators initialized')
  }

  on_quote_data(quote_data) {
    // log('Received new quote data:', quote_data)
    // Update indicators with new quote data
    const { symbol, c: close_price } = quote_data
    const indicator_suffixes = [
      '_rsi_10',
      '_cum_return_6',
      '_cum_return_1',
      '_max_drawdown_10',
      '_moving_avg_25',
      '_rsi_60',
      '_rsi_45',
      '_rsi_200'
    ]

    indicator_suffixes.forEach((indicator_suffix) => {
      const indicator_key = `${symbol.toLowerCase()}${indicator_suffix}`
      if (this.indicators[indicator_key]) {
        this.indicator_values[indicator_key] =
          this.indicators[indicator_key].nextValue(close_price)
      }
    })

    if (typeof this.latest_quotes[symbol] !== 'undefined') {
      this.latest_quotes[symbol] = close_price
    }
  }

  async on_end_of_day({ current_date: current_date_unix }) {
    const assets = await this.calculate_allocations({
      quote_date_unix: current_date_unix
    })
    await this.allocate_assets({ assets, current_date_unix })
  }

  async calculate_allocations({ quote_date_unix }) {
    // log('Rebalancing portfolio')
    const {
      tqqq_rsi_10,
      tqqq_cum_return_6,
      tqqq_cum_return_1,
      tmf_max_drawdown_10,
      qqq_max_drawdown_10,
      qqq_moving_avg_25,
      spy_rsi_60,
      bnd_rsi_45,
      ief_rsi_200,
      tlt_rsi_200
    } = this.indicator_values
    const qqq_current_price = await this.get_current_price({
      symbol: 'QQQ',
      quote_date_unix
    })

    trade_info_log('Indicator values:', {
      tqqq_rsi_10,
      tqqq_cum_return_6,
      tqqq_cum_return_1,
      tmf_max_drawdown_10,
      qqq_max_drawdown_10,
      qqq_moving_avg_25,
      spy_rsi_60,
      bnd_rsi_45,
      ief_rsi_200,
      tlt_rsi_200,
      qqq_current_price
    })

    if (tqqq_rsi_10 > this.tqqq_rsi_overbought_threshold) {
      return this.calculate_overbought_market_allocations()
    } else if (tqqq_cum_return_6 < -12) {
      return this.calculate_volatile_market_allocations({ quote_date_unix })
    } else {
      return this.calculate_normal_market_allocations(qqq_current_price)
    }
  }

  async calculate_overbought_market_allocations() {
    trade_info_log(
      `Overbought Market: TQQQ RSI > ${this.tqqq_rsi_overbought_threshold}, investing in UVXY.`
    )
    trade_info_log(
      'Intent: UVXY is a leveraged ETF that benefits from market volatility, suitable when the market is overbought and likely to correct.'
    )
    return ['UVXY']
  }

  async calculate_volatile_market_allocations({ quote_date_unix }) {
    const { tqqq_cum_return_1, tqqq_rsi_10, tmf_max_drawdown_10 } =
      this.indicator_values

    trade_info_log(
      'Volatile Market: TQQQ cumulative return over 6 days < -12%.'
    )
    if (tqqq_cum_return_1 > 5.5) {
      trade_info_log('TQQQ 1-day return > 5.5%, investing in UVXY.')
      trade_info_log(
        'Intent: UVXY can capitalize on short-term spikes in volatility.'
      )
      return ['UVXY']
    } else if (tqqq_rsi_10 < this.tqqq_rsi_oversold_threshold) {
      trade_info_log(
        `Oversold Market. TQQQ RSI: ${tqqq_rsi_10} below oversold threshold of ${this.tqqq_rsi_oversold_threshold}.`
      )
      trade_info_log(
        'Intent: SOXL is a leveraged ETF that benefits from market corrections, suitable when the market is oversold and likely to rebound.'
      )
      return ['SOXL']
    } else if (tmf_max_drawdown_10 < 0.07) {
      trade_info_log('TMF max drawdown over 10 days < 7%, investing in SOXL.')
      trade_info_log(
        'Intent: A lower drawdown in TMF suggests stability, making it safer to invest in a high-risk, high-reward asset like SOXL.'
      )
      return ['SOXL']
    } else if (
      (await this.get_current_price({
        symbol: 'IEF',
        quote_date_unix
      })) >
      (await this.get_current_price({
        symbol: 'TLT',
        quote_date_unix
      }))
    ) {
      trade_info_log('IEF current price > TLT current price, investing in BIL.')
      trade_info_log(
        'Intent: BIL is a safe, short-term treasury ETF, chosen when long-term bonds (TLT) outperform intermediate-term bonds (IEF), indicating a preference for safety.'
      )
      return ['BIL']
    } else {
      trade_info_log('Default condition met, investing in SOXL.')
      trade_info_log(
        'Intent: Default to SOXL when other conditions are not met.'
      )
      return ['SOXL']
    }
  }

  async calculate_normal_market_allocations(qqq_current_price) {
    const {
      tqqq_rsi_10,
      qqq_max_drawdown_10,
      tmf_max_drawdown_10,
      qqq_moving_avg_25,
      spy_rsi_60,
      bnd_rsi_45,
      ief_rsi_200,
      tlt_rsi_200
    } = this.indicator_values

    const tqqq_rsi_distance = this.tqqq_rsi_overbought_threshold - tqqq_rsi_10
    const tqqq_rsi_percentage =
      (tqqq_rsi_distance / this.tqqq_rsi_overbought_threshold) * 100
    trade_info_log(
      `TQQQ RSI is ${tqqq_rsi_10}, which is ${tqqq_rsi_distance} points and ${tqqq_rsi_percentage.toFixed(
        2
      )}% away from the threshold of ${this.tqqq_rsi_overbought_threshold}.`
    )
    trade_info_log('Normal Market: TQQQ cumulative return over 6 days >= -12%.')
    if (qqq_max_drawdown_10 > 0.06) {
      trade_info_log('QQQ max drawdown over 10 days > 6%, investing in BIL.')
      trade_info_log(
        'Intent: A higher drawdown in QQQ suggests increased risk, so it opts for the safety of BIL.'
      )
      return ['BIL']
    } else if (tmf_max_drawdown_10 > 0.07) {
      trade_info_log('TMF max drawdown over 10 days > 7%, investing in BIL.')
      trade_info_log(
        'Intent: Similar to QQQ, a higher drawdown in TMF indicates risk, favoring BIL.'
      )
      return ['BIL']
    } else if (qqq_current_price > qqq_moving_avg_25) {
      trade_info_log(
        'QQQ current price > 25-day moving average, investing in TQQQ.'
      )
      trade_info_log(
        'Intent: A higher current price suggests an upward trend, making TQQQ a good choice for growth.'
      )
      return ['TQQQ']
    } else if (spy_rsi_60 > 50) {
      trade_info_log('SPY RSI over 60 days > 50, checking further conditions.')
      if (bnd_rsi_45 > spy_rsi_60) {
        trade_info_log('BND RSI over 45 days > SPY RSI, investing in TQQQ.')
        trade_info_log(
          'Intent: If bonds (BND) are stronger than stocks (SPY), it indicates a cautious market, favoring TQQQ for growth.'
        )
        return ['TQQQ']
      } else {
        trade_info_log('Default condition met, investing in BIL.')
        trade_info_log(
          'Intent: Default to BIL when other conditions are not met.'
        )
        return ['BIL']
      }
    } else if (ief_rsi_200 < tlt_rsi_200) {
      trade_info_log(
        'IEF RSI over 200 days < TLT RSI, checking further conditions.'
      )
      if (bnd_rsi_45 > spy_rsi_60) {
        trade_info_log('BND RSI over 45 days > SPY RSI, investing in TQQQ.')
        trade_info_log(
          'Intent: If bonds (BND) are stronger than stocks (SPY), it indicates a cautious market, favoring TQQQ for growth.'
        )
        return ['TQQQ']
      } else {
        trade_info_log('Default condition met, investing in BIL.')
        trade_info_log(
          'Intent: Default to BIL when other conditions are not met.'
        )
        return ['BIL']
      }
    } else {
      trade_info_log('Default condition met, investing in BIL.')
      trade_info_log(
        'Intent: Default to BIL when other conditions are not met.'
      )
      return ['BIL']
    }
  }

  async get_current_price({ symbol, quote_date_unix = dayjs().unix() }) {
    // log('Fetching current price for symbol:', symbol)

    // Check if the latest quote is available in the latest_quotes variable
    if (this.latest_quotes[symbol]) {
      return this.latest_quotes[symbol]
    }

    // Check if the latest quote is available in the Holdings object
    const holding_id = `${constants.HOLDING_TYPE.EQUITY}_${symbol}`
    const holding = this.Holdings.holdings[holding_id]
    if (holding.latest_quote) {
      log(
        'Latest quote found for symbol:',
        symbol,
        'Price:',
        holding.latest_quote.c
      )
      return holding.latest_quote.c
    }

    // TODO get live current price

    // get latest quote from the database
    const latest_quote = await db('eod_equity_quotes')
      .where('symbol', symbol)
      .andWhere('quote_unixtime', '<=', quote_date_unix)
      .orderBy('quote_unixtime', 'desc')
      .first()

    return latest_quote.c
  }

  async allocate_assets({ assets, current_date_unix }) {
    log('Allocating assets:', assets)
    const total_value = this.Holdings.total_value
    const allocation = total_value / assets.length

    // Sell holdings not included in the new allocations
    for (const holding_id in this.Holdings.holdings) {
      const holding = this.Holdings.holdings[holding_id]
      const symbol = holding_id.split('_')[1]
      if (!assets.includes(symbol) && holding.quantity) {
        // log(
        //   `Selling all holdings of ${symbol} as it is not in the new allocations`
        // )
        await this.Holdings.sell_equity({
          symbol,
          quantity: holding.quantity,
          price: await this.get_current_price({
            symbol,
            quote_date_unix: current_date_unix
          }),
          date: current_date_unix,
          quote_type: `${constants.HOLDING_TYPE.EQUITY}_${constants.RESOLUTION.DAY}`
        })
      }
    }

    // Adjust holdings based on new allocations
    for (const asset of assets) {
      const current_price = await this.get_current_price({
        symbol: asset,
        quote_date_unix: current_date_unix
      })
      const holding_id = `${constants.HOLDING_TYPE.EQUITY}_${asset}`
      const current_holding = this.Holdings.holdings[holding_id] || {
        quantity: 0
      }

      const target_quantity = Math.floor(allocation / current_price)
      const quantity_difference = target_quantity - current_holding.quantity

      // log(`Target quantity: ${target_quantity}`)
      // log(`Current quantity: ${current_holding.quantity}`)
      // log(`Quantity difference: ${quantity_difference}`)

      if (quantity_difference > 0) {
        log(`Buying ${quantity_difference} of ${asset}`)
        this.Holdings.buy_equity({
          symbol: asset,
          quantity: quantity_difference,
          price: current_price,
          date: current_date_unix,
          quote_type: `${constants.HOLDING_TYPE.EQUITY}_${constants.RESOLUTION.DAY}`
        })
      } else if (quantity_difference < 0) {
        log(`Selling ${Math.abs(quantity_difference)} of ${asset}`)
        this.Holdings.sell_equity({
          symbol: asset,
          quantity: Math.abs(quantity_difference),
          price: current_price,
          date: current_date_unix,
          quote_type: `${constants.HOLDING_TYPE.EQUITY}_${constants.RESOLUTION.DAY}`
        })
      }
    }
  }
}
