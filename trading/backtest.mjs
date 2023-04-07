import db from '#db'
import debug from 'debug'

import * as constants from './constants.mjs'

const log = debug('backtest')
debug.enable('backtest')

const batch_size = 1000

const get_data_table_name = (quote_type) => {
  switch (quote_type) {
    case `${constants.HOLDING_TYPE.EQUITY}_${constants.RESOLUTION.DAY}`:
      return 'eod_equity_quotes'

    case `${constants.HOLDING_TYPE.OPTION}_${constants.RESOLUTION.DAY}`:
      return 'eod_option_quotes'

    default:
      throw new Error(`No data table for quote type ${quote_type}`)
  }
}

export default class Backtest {
  constructor({ accounts, start, end }) {
    this.accounts = accounts
    this.start = start
    this.end = end

    this.data_tables = {}
    this.quote_data = []
  }

  async run() {
    this.load_holdings()
    await this.process_quote_data_batch()
  }

  async process_quote_data_batch() {
    log('Processing quote data batch...')
    await this.load_quote_data_batch()
    for (const tick of this.quote_data) {
      for (const account of this.accounts) {
        account.on_quote_data(tick)
      }
    }

    const is_complete = Object.values(this.data_tables).every(
      (data_table) => data_table.is_loaded
    )

    if (!is_complete) {
      await this.process_quote_data_batch()
    }
  }

  register_quote_type({ quote_type, ticker }) {
    log(`Registering quote type ${quote_type} for ticker ${ticker}`)
    const table_name = get_data_table_name(quote_type)

    if (this.data_tables[table_name]) {
      this.data_tables[table_name].tickers[ticker] = true
    } else {
      this.data_tables[table_name] = {
        table_name,
        tickers: { [ticker]: true },
        batch_offset: 0,
        quote_type
      }
    }
  }

  load_holdings() {
    for (const account of this.accounts) {
      for (const holding of Object.values(account.Holdings.holdings)) {
        const { quote_type, ticker } = holding
        this.register_quote_type({ quote_type, ticker })
      }
    }
  }

  async load_quote_data_batch() {
    for (const data_table of Object.values(this.data_tables)) {
      const { table_name, tickers, batch_offset, is_loaded, quote_type } =
        data_table
      if (is_loaded) {
        log(`Finished loading quote_data for ${quote_type}`)
        continue
      }

      const symbols = Object.keys(tickers)
      const data = await db(table_name)
        .whereIn('symbol', symbols)
        .where('quote_date', '>=', this.start)
        .where('quote_date', '<=', this.end)
        .orderBy('quote_date', 'asc')
        .limit(batch_size)
        .offset(batch_offset)

      log(
        `Loaded ${data.length} rows of quote_data for ${quote_type} from ${table_name}`
      )

      this.data_tables[table_name].batch_offset += data.length

      if (data.length < batch_size) {
        this.data_tables[table_name].is_loaded = true
      }

      if (data.length === 0) {
        continue
      }

      const formatted_data = data.map((row) => ({
        ...row,
        quote_type
      }))

      this.quote_data.push(...formatted_data)
    }

    this.quote_data.sort((a, b) => {
      return a.quote_date - b.quote_date
    })
  }
}
