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

    this.is_complete = false
    this.batch_offset = 0

    this.data_tables = {}
    this.quote_data = []
  }

  async run() {
    log(
      'Running backtest for accounts: ',
      this.accounts.map((a) => a.name)
    )
    log('Start: ', this.start)
    log('End: ', this.end)
    this.load_holdings()
    await this.next_quote_data_batch()
    await this.get_final_quotes()

    return this.stats()
  }

  stats() {
    const stats = {}
    for (const account of this.accounts) {
      stats[account.name] = account.stats()
    }
    return stats
  }

  async next_quote_data_batch() {
    log('Loading quote data batch...')
    await this.load_quote_data_batch()
    for (const tick of this.quote_data) {
      for (const account of this.accounts) {
        account.on_quote_data(tick)
      }
    }

    if (!this.is_complete) {
      await this.next_quote_data_batch()
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
    const table_names = Object.keys(this.data_tables)
    const all_columns = await db('information_schema.columns')
      .select('table_name as table_name', 'column_name as column_name')
      .whereIn('table_name', table_names)

    const unique_columns = [...new Set(all_columns.map((c) => c.column_name))]
    const column_index = {}
    for (const column of all_columns) {
      const { table_name, column_name } = column
      const key = `${table_name}.${column_name}`
      column_index[key] = true
    }

    const table_queries = []
    for (const data_table of Object.values(this.data_tables)) {
      const { table_name, tickers, quote_type } = data_table
      const table_columns = unique_columns.map((c) => {
        if (column_index[`${table_name}.${c}`]) {
          return c
        } else {
          return db.raw(`null as ${c}`)
        }
      })

      const symbols = Object.keys(tickers)
      const table_query = db(table_name)
        .select(
          db.raw(`${table_columns.join(', ')}, '${quote_type}' as quote_type`)
        )
        .whereIn('symbol', symbols)
        .where('quote_date', '>=', this.start)
        .where('quote_date', '<=', this.end)

      table_queries.push(table_query)
    }

    let data
    if (table_queries.length === 1) {
      data = await table_queries[0]
    } else {
      const raw_response = await db.raw(
        `${table_queries
          .map((query) => query.toQuery())
          .join(
            ' union '
          )} order by quote_date asc limit ${batch_size} offset ${
          this.batch_offset
        }`
      )
      data = raw_response[0]
    }

    log(
      `Loaded ${data.length} rows of quote data from ${table_queries.length} tables`
    )

    this.batch_offset += data.length

    if (data.length < batch_size) {
      this.is_complete = true
    }

    if (data.length === 0) {
      return
    }

    this.quote_data = data
  }

  async get_final_quotes() {
    for (const account of this.accounts) {
      for (const holding_id in account.Holdings.holdings) {
        const holding = account.Holdings.holdings[holding_id]
        const { quote_type, ticker } = holding
        const table_name = get_data_table_name(quote_type)
        const latest_quote = await db(table_name)
          .select('*')
          .where({ symbol: ticker })
          .where('quote_date', '<=', this.end)
          .orderBy('quote_date', 'desc')
          .first()

        if (latest_quote) {
          holding.latest_quote = latest_quote
        }
      }
    }
  }
}
