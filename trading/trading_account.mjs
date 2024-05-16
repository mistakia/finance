import Holdings from './holdings.mjs'

export class Trading_Account {
  constructor(params) {
    this.name = params.name || 'Default Trading Account'
    this.Holdings = params.holdings || new Holdings()
    this.quote_queries = []
  }

  get summary() {
    return this.Holdings.summary
  }

  register_quote_query({ type, resolution, query_func, query_params }) {
    const quote_type = `${type}_${resolution}`
    this.quote_queries.push({ quote_type, query_func, query_params })
  }

  on_quote_data(quote_data) {
    // do nothing
  }
}
