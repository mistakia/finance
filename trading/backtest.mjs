export default class Backtest {
  constructor({ accounts, start, end }) {
    this.accounts = accounts
    this.start = start
    this.end = end

    this.holdings = {}
    this.data = []
  }

  async run() {
    this.load_holdings()
    await this.load_data()
    for (const tick of this.data) {
      for (const account of this.accounts) {
        account.on_tick(tick)
      }
    }
  }

  load_holdings() {
    for (const account of this.accounts) {
      for (const [holding_id, holding] of Object.entries(
        account.Portfolio.holdings
      )) {
        this.holdings[holding_id] = holding
      }
    }
  }

  async load_data() {
    // get data from db for each holding
    // store data in this.data
  }
}
