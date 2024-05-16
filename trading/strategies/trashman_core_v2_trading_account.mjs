import dayjs from 'dayjs'
import { RSI, SMA, ROC } from '@debut/indicators'
import debug from 'debug'

import { MaxDrawdown } from '#libs-server'
import db from '#db'
import { Trading_Account } from '../trading_account.mjs'
import * as constants from '../constants.mjs'
import import_historical_prices_yahoo from '#scripts/import-historical-prices-yahoo.mjs'

const log = debug('trashman_core_v2_trading_account')

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

    this.register_quote_query({
      type: constants.HOLDING_TYPE.EQUITY,
      resolution: constants.RESOLUTION.DAY,
      query_params: { symbols: this.holding_symbols }
    })

    this.holding_symbols.forEach((symbol) => {
      const quote_type = `${constants.HOLDING_TYPE.EQUITY}_${constants.RESOLUTION.DAY}`
      this.Holdings.register_equity({ symbol, quote_type })
    })
  }

  async init() {
    log('Initializing historical quotes and indicators')
    await this.load_historical_quotes()
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

        const is_up_to_date =
          (current_date.isAfter(market_close_time) &&
            last_entry_date.format('YYYY-MM-DD') ===
              current_date.format('YYYY-MM-DD')) ||
          (current_date.isBefore(market_close_time) &&
            last_entry_date.format('YYYY-MM-DD') ===
              current_date.subtract(1, 'day').format('YYYY-MM-DD'))

        if (is_up_to_date) {
          log(`Latest quote for ${symbol} is up to date. Skipping import.`)
          continue
        }
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
      await import_historical_prices_yahoo({ symbol, start_year })
    }
  }

  async load_historical_quotes() {
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
    log('Received new quote data:', quote_data)
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
  }

  async calculate_allocations() {
    log('Rebalancing portfolio')
    let target_assets = []

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
    const qqq_current_price = await this.get_current_price('QQQ')

    log('Indicator values:', {
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

    // Log market description

    if (tqqq_rsi_10 > this.tqqq_rsi_overbought_threshold) {
      log(
        `Overbought Market: TQQQ RSI > ${this.tqqq_rsi_overbought_threshold}, investing in UVXY.`
      )
      log(
        'Intent: UVXY is a leveraged ETF that benefits from market volatility, suitable when the market is overbought and likely to correct.'
      )
      target_assets = ['UVXY']
    } else if (tqqq_cum_return_6 < -12) {
      log('Volatile Market: TQQQ cumulative return over 6 days < -12%.')
      if (tqqq_cum_return_1 > 5.5) {
        log('TQQQ 1-day return > 5.5%, investing in UVXY.')
        log('Intent: UVXY can capitalize on short-term spikes in volatility.')
        target_assets = ['UVXY']
      } else if (tqqq_rsi_10 < this.tqqq_rsi_oversold_threshold) {
        log(
          `Oversold Market (TQQQ RSI < ${this.tqqq_rsi_oversold_threshold}), checking further conditions.`
        )
        if (tmf_max_drawdown_10 < 0.07) {
          log('TMF max drawdown over 10 days < 7%, investing in SOXL.')
          log(
            'Intent: A lower drawdown in TMF suggests stability, making it safer to invest in a high-risk, high-reward asset like SOXL.'
          )
          target_assets = ['SOXL']
        } else if (
          (await this.get_current_price('IEF')) >
          (await this.get_current_price('TLT'))
        ) {
          log('IEF current price > TLT current price, investing in BIL.')
          log(
            'Intent: BIL is a safe, short-term treasury ETF, chosen when long-term bonds (TLT) outperform intermediate-term bonds (IEF), indicating a preference for safety.'
          )
          target_assets = ['BIL']
        } else {
          log('Default condition met, investing in SOXL.')
          log('Intent: Default to SOXL when other conditions are not met.')
          target_assets = ['SOXL']
        }
      }
    } else {
      const tqqq_rsi_distance = this.tqqq_rsi_overbought_threshold - tqqq_rsi_10
      const tqqq_rsi_percentage =
        (tqqq_rsi_distance / this.tqqq_rsi_overbought_threshold) * 100
      log(
        `TQQQ RSI is ${tqqq_rsi_10}, which is ${tqqq_rsi_distance} points and ${tqqq_rsi_percentage.toFixed(
          2
        )}% away from the threshold of ${this.tqqq_rsi_overbought_threshold}.`
      )
      log('Normal Market: TQQQ cumulative return over 6 days >= -12%.')
      if (qqq_max_drawdown_10 > 0.06) {
        log('QQQ max drawdown over 10 days > 6%, investing in BIL.')
        log(
          'Intent: A higher drawdown in QQQ suggests increased risk, so it opts for the safety of BIL.'
        )
        target_assets = ['BIL']
      } else if (tmf_max_drawdown_10 > 0.07) {
        log('TMF max drawdown over 10 days > 7%, investing in BIL.')
        log(
          'Intent: Similar to QQQ, a higher drawdown in TMF indicates risk, favoring BIL.'
        )
        target_assets = ['BIL']
      } else if (qqq_current_price > qqq_moving_avg_25) {
        log('QQQ current price > 25-day moving average, investing in TQQQ.')
        log(
          'Intent: A higher current price suggests an upward trend, making TQQQ a good choice for growth.'
        )
        target_assets = ['TQQQ']
      } else if (spy_rsi_60 > 50) {
        log('SPY RSI over 60 days > 50, checking further conditions.')
        if (bnd_rsi_45 > spy_rsi_60) {
          log('BND RSI over 45 days > SPY RSI, investing in TQQQ.')
          log(
            'Intent: If bonds (BND) are stronger than stocks (SPY), it indicates a cautious market, favoring TQQQ for growth.'
          )
          target_assets = ['TQQQ']
        } else {
          log('Default condition met, investing in BIL.')
          log('Intent: Default to BIL when other conditions are not met.')
          target_assets = ['BIL']
        }
      } else if (ief_rsi_200 < tlt_rsi_200) {
        log('IEF RSI over 200 days < TLT RSI, checking further conditions.')
        if (bnd_rsi_45 > spy_rsi_60) {
          log('BND RSI over 45 days > SPY RSI, investing in TQQQ.')
          log(
            'Intent: If bonds (BND) are stronger than stocks (SPY), it indicates a cautious market, favoring TQQQ for growth.'
          )
          target_assets = ['TQQQ']
        } else {
          log('Default condition met, investing in BIL.')
          log('Intent: Default to BIL when other conditions are not met.')
          target_assets = ['BIL']
        }
      } else {
        log('Default condition met, investing in BIL.')
        log('Intent: Default to BIL when other conditions are not met.')
        target_assets = ['BIL']
      }
    }

    log('Target assets for allocation:', target_assets)
    return target_assets
  }

  async get_current_price(symbol) {
    log('Fetching current price for symbol:', symbol)
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

    const latest_quote = await db('eod_equity_quotes')
      .where('symbol', symbol)
      .orderBy('quote_unixtime', 'desc')
      .first()

    return latest_quote.c
  }

  allocate_assets(assets) {
    log('Allocating assets:', assets)
    // const total_cash = this.Holdings.cash
    // const allocation = total_cash / assets.length

    // TODO
  }
}
