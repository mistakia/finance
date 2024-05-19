import debug from 'debug'
import dayjs from 'dayjs'

import db from '#db'
import * as constants from './constants.mjs'

const log = debug('backtest')

const batch_size = 500000

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
  constructor({ accounts, start_date, end_date }) {
    this.accounts = accounts
    this.start_date = start_date
    this.end_date = end_date

    this.is_complete = false
    this.batch_offset = 0

    this.data_tables = {}
    this.quote_data = []
    this.option_quote_data = null
  }

  async run() {
    log(
      'Running backtest for accounts: ',
      this.accounts.map((a) => a.name)
    )
    log('Start: ', this.start_date)
    log('End: ', this.end_date)
    this.register_quote_queries()
    await this.next_quote_data_batch()

    return this.summary()
  }

  summary() {
    const result = {}
    for (const account of this.accounts) {
      result[account.name] = account.summary
    }
    return result
  }

  async next_quote_data_batch() {
    await this.load_quote_data_batch()

    const emit_quote_data = (quote_data) => {
      for (const account of this.accounts) {
        account.on_quote_data(quote_data)
      }
    }

    const emit_on_end_of_day = async ({ current_date, next_date }) => {
      for (const account of this.accounts) {
        if (account.on_end_of_day) {
          await account.on_end_of_day({ current_date, next_date })
        }
      }
    }

    for (const quote_data of this.quote_data) {
      const { underlying_symbol, quote_type, quote_unixtime, quote_date } =
        quote_data

      // if new day, make end of day adjustments
      if (
        this.last_quote_unixtime &&
        this.last_quote_unixtime !== quote_unixtime
      ) {
        await emit_on_end_of_day({
          current_date: this.last_quote_unixtime,
          next_date: quote_unixtime
        })
        this.on_end_of_day({
          current_date: this.last_quote_unixtime,
          next_date: quote_unixtime
        })
      }

      this.last_quote_unixtime = quote_unixtime

      if (quote_type.includes(constants.HOLDING_TYPE.OPTION)) {
        if (!this.option_quote_data) {
          this.option_quote_data = {
            quote_type,
            underlying_symbol,
            quote_unixtime,
            quote_date,
            option_chain: [quote_data]
          }
        } else if (
          this.option_quote_data.quote_unixtime !== quote_unixtime ||
          this.option_quote_data.underlying_symbol !== underlying_symbol
        ) {
          emit_quote_data(this.option_quote_data)
          this.option_quote_data = {
            quote_type,
            underlying_symbol,
            quote_unixtime,
            quote_date,
            option_chain: [quote_data]
          }
        } else {
          this.option_quote_data.option_chain.push(quote_data)
        }

        // check if quote is for any holdings in any accounts
        const put_holding_id = `${constants.HOLDING_TYPE.OPTION}_${quote_data.put_symbol}`
        const call_holding_id = `${constants.HOLDING_TYPE.OPTION}_${quote_data.call_symbol}`
        for (const account of this.accounts) {
          if (account.Holdings.holdings[put_holding_id]) {
            account.Holdings.holdings[put_holding_id].latest_quote = quote_data
          }

          if (account.Holdings.holdings[call_holding_id]) {
            account.Holdings.holdings[call_holding_id].latest_quote = quote_data
          }
        }

        continue
      }

      const holding_id = `${constants.HOLDING_TYPE.EQUITY}_${quote_data.symbol}`
      for (const account of this.accounts) {
        if (account.Holdings.holdings[holding_id]) {
          account.Holdings.holdings[holding_id].latest_quote = quote_data
        }
      }

      emit_quote_data(quote_data)
    }

    if (!this.is_complete) {
      await this.next_quote_data_batch()
    }
  }

  register_quote_type({ quote_type, query_func, query_params }) {
    const table_name = get_data_table_name(quote_type)

    if (!this.data_tables[table_name]) {
      this.data_tables[table_name] = {
        table_name,
        quote_type,
        queries: []
      }
    }

    if (query_func) {
      this.data_tables[table_name].queries.push(query_func)
    }

    if (query_params) {
      // check if query params already exists
      const new_query = JSON.stringify(query_params)

      for (const query of this.data_tables[table_name].queries) {
        const existing_query = JSON.stringify(query)
        if (existing_query === new_query) {
          return
        }
      }

      this.data_tables[table_name].queries.push(query_params)
    }
  }

  register_quote_queries() {
    for (const account of this.accounts) {
      for (const quote_query of account.quote_queries) {
        this.register_quote_type(quote_query)
      }
    }
  }

  async load_quote_data_batch() {
    log('Loading quote data batch...')
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
      const { table_name, queries, quote_type } = data_table
      const table_columns = unique_columns.map((c) => {
        if (column_index[`${table_name}.${c}`]) {
          return c
        } else {
          return db.raw(`null as ${c}`)
        }
      })

      const table_query = db(table_name)
        .select(
          db.raw(`${table_columns.join(', ')}, '${quote_type}' as quote_type`)
        )
        .where('quote_date', '>=', this.start_date)
        .where('quote_date', '<=', this.end_date)
        .where(function () {
          for (const query of queries) {
            this.orWhere(query)
          }
        })
        .orderBy('quote_date', 'asc')
        .orderBy('symbol', 'asc')

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
          )} order by quote_date asc, symbol asc, quote_type asc limit ${batch_size} offset ${
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

  on_end_of_day({ next_date }) {
    log(`on_end_of_day: ${dayjs.unix(next_date).format('YYYY-MM-DD')}`)
    for (const account of this.accounts) {
      // update expired option holdings
      for (const holding_id in account.Holdings.holdings) {
        const holding = account.Holdings.holdings[holding_id]
        if (
          holding.holding_type === constants.HOLDING_TYPE.OPTION &&
          !holding.expired
        ) {
          if (!holding.exercised && !holding.closed) {
            const underlying_holding_id = `${constants.HOLDING_TYPE.EQUITY}_${holding.underlying_symbol}`
            const underlying_quote =
              account.Holdings.holdings[underlying_holding_id].latest_quote.c

            // const log_params = {
            //   holding_id,
            //   underlying_quote,
            //   strike: holding.strike,
            //   option_type: holding.option_type,
            //   date: next_date
            // }
            // log(`checking expired option`, log_params)

            // check if option should be exercised
            if (
              holding.option_type === constants.OPTION_TYPE.CALL &&
              holding.strike < underlying_quote
            ) {
              account.Holdings.exercise_option({ holding_id, date: next_date })
            } else if (
              holding.option_type === constants.OPTION_TYPE.PUT &&
              holding.strike > underlying_quote
            ) {
              account.Holdings.exercise_option({ holding_id, date: next_date })
            }
          }

          if (holding.expire_unix < next_date) {
            holding.expired = true
          }
        }
      }
    }
  }
}
