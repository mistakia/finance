import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import Table from 'cli-table3'

import db from '#db'
import config from '#config'
import { isMain, addAsset } from '#libs-shared'
import { interactive_brokers } from '#libs-server'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-interactive-brokers-accounts')
debug.enable(
  'import-interactive-brokers-accounts,interactive-brokers*,refresh-historical-quotes,tradingview'
)

const import_interactive_brokers_accounts = async ({
  credentials,
  publicKey,
  keep_alive = false
}) => {
  const inserts = []
  try {
    const account_info = await interactive_brokers.get_account_info({
      ...credentials,
      keep_alive
    })

    // Create tables for different sections
    // Summary table
    const cash_table = new Table({
      head: ['Metric', 'Value'],
      style: { head: ['cyan'] }
    })

    Object.entries(account_info.summary).forEach(([key, value]) => {
      cash_table.push([key, value])
    })

    // Risk tables
    const unlimited_risk_table = new Table({
      head: ['Symbol', 'Strike', 'Expiration', 'Contracts', 'Shares Needed'],
      style: { head: ['cyan'] }
    })

    account_info.analysis.risk.unlimited_risk_positions.forEach((pos) => {
      unlimited_risk_table.push([
        pos.symbol,
        pos.strike,
        pos.expiration,
        pos.contracts,
        pos.shares_needed
      ])
    })

    const uncovered_put_table = new Table({
      head: [
        'Symbol',
        'Strike',
        'Expiration',
        'Contracts',
        'Liability',
        'Delta',
        'Prob. ITM'
      ],
      style: { head: ['cyan'] }
    })

    account_info.analysis.risk.uncovered_put_positions.forEach((pos) => {
      // For puts, Prob. ITM = abs(delta)
      const probability_itm = pos.delta ? Math.abs(pos.delta).toFixed(4) : 'N/A'
      uncovered_put_table.push([
        pos.symbol,
        pos.strike,
        pos.expiration,
        pos.contracts,
        pos.liability,
        pos.delta !== null ? pos.delta.toFixed(4) : 'N/A',
        probability_itm
      ])
    })

    const liability_table = new Table({
      head: ['Liability Type', 'Amount'],
      style: { head: ['cyan'] }
    })

    liability_table.push(
      ['Option Cash', account_info.analysis.risk.option_cash_liability],
      [
        'Uncovered Puts',
        account_info.analysis.risk.total_uncovered_put_liability
      ],
      ['Total Risk', account_info.analysis.risk.total.limited_risk_total],
      [
        'Delta Exposure ($)',
        account_info.analysis.risk.delta_exposure.delta_dollars
      ]
    )

    const delta_liability_table = new Table({
      head: ['Delta Threshold', 'Liability'],
      style: { head: ['cyan'] }
    })

    // Sort delta thresholds for better presentation (largest to smallest for greater than)
    const delta_entries = Object.entries(
      account_info.analysis.delta_liability.by_delta
    ).sort((a, b) => {
      // Extract numeric values from keys like "delta_greater_than_0.1"
      const extractValue = (key) => {
        const match = key.match(/delta_greater_than_(\d+\.\d+)/)
        return match ? parseFloat(match[1]) : 0
      }
      return extractValue(b[0]) - extractValue(a[0]) // Sort descending
    })

    delta_entries.forEach(([threshold, liability]) => {
      // Format the threshold to be more readable
      const formatted_threshold = threshold.replace(
        'delta_greater_than_',
        'δ > '
      )
      delta_liability_table.push([formatted_threshold, liability])
    })

    const strategy_table = new Table({
      head: [
        'Underlying',
        'Expiration',
        'Strategy Type',
        'Max Risk',
        'Max Profit',
        'Positions'
      ],
      style: { head: ['cyan'] }
    })

    account_info.analysis.strategies.forEach((strat) => {
      const positions = strat.positions
        .map((pos) => {
          const quantity = pos.quantity > 0 ? `+${pos.quantity}` : pos.quantity
          const delta = pos.delta !== null ? ` (δ=${pos.delta.toFixed(4)})` : ''
          return `${pos.symbol} ${pos.right} ${pos.strike} ${quantity}${delta}`
        })
        .join('\n')

      strategy_table.push([
        strat.underlying,
        strat.expiration,
        strat.strategy_type + (strat.variation ? ` (${strat.variation})` : ''),
        strat.max_risk,
        strat.max_profit,
        positions
      ])
    })

    const positions_table = new Table({
      head: [
        'Symbol',
        'Type',
        'Quantity',
        'Cost Basis',
        'Strike',
        'Expiration',
        'Right'
      ],
      style: { head: ['cyan'] }
    })

    // Add all positions to the table
    account_info.positions.forEach((position) => {
      const is_option = position.contract.secType === 'OPT'
      positions_table.push([
        position.contract.symbol,
        position.contract.secType,
        position.pos,
        position.avgCost,
        is_option ? position.contract.strike : '-',
        is_option ? position.contract.lastTradeDateOrContractMonth : '-',
        is_option ? position.contract.right : '-'
      ])
    })

    // Symbol risk table
    const symbol_risk_table = new Table({
      head: [
        'Symbol',
        'Shares',
        'Short Calls',
        'Short Puts',
        'Delta Exposure',
        'Market Price'
      ],
      style: { head: ['cyan'] }
    })

    account_info.analysis.symbols.forEach((symbol) => {
      symbol_risk_table.push([
        symbol.symbol,
        symbol.total_shares,
        symbol.short_calls,
        symbol.short_puts,
        symbol.delta_exposure.toFixed(2),
        symbol.market_price || 'N/A'
      ])
    })

    // Expected value table
    const expected_value_table = new Table({
      head: ['Symbol', 'Expected Value', 'Position Details'],
      style: { head: ['cyan'] }
    })

    account_info.analysis.expected_value.by_symbol.forEach((symbol) => {
      if (symbol.positions.length === 0) return

      const positions_detail = symbol.positions
        .map(
          (p) =>
            `${p.symbol} ${p.right} ${
              p.strike
            } (EV: $${p.expected_value.toFixed(2)})`
        )
        .join('\n')

      expected_value_table.push([
        symbol.symbol,
        `$${symbol.expected_value.toFixed(2)}`,
        positions_detail
      ])
    })

    console.log('\nCash Balances:')
    console.log(cash_table.toString())
    console.log('\nAll Positions:')
    console.log(positions_table.toString())
    console.log('\nUnlimited Risk Positions:')
    console.log(unlimited_risk_table.toString())
    console.log('\nUncovered Put Positions:')
    console.log(uncovered_put_table.toString())
    console.log('\nLiabilities:')
    console.log(liability_table.toString())
    console.log('\nLiability by Delta:')
    console.log(delta_liability_table.toString())
    console.log('\nStrategies:')
    console.log(strategy_table.toString())
    console.log('\nSymbol Risk Analysis:')
    console.log(symbol_risk_table.toString())
    console.log('\nExpected Value Analysis:')
    console.log(expected_value_table.toString())

    const asset = await addAsset({ asset_type: 'currency', symbol: 'USD' })
    const cash_balance = Number(account_info.summary.TotalCashValue)

    inserts.push({
      link: `/${publicKey}/interactive_brokers/USD`, // TODO - include hash of accountId
      name: 'Cash',
      cost_basis: cash_balance,
      quantity: cash_balance,
      symbol: 'USD',
      asset_link: asset.link
    })
  } catch (err) {
    log(err)
  }

  if (inserts.length) {
    log(`Inserting ${inserts.length} interactive brokers accounts`)
    await db('holdings').insert(inserts).onConflict('link').merge()
  }
}

const cleanup_containers = async () => {
  try {
    const { host, docker_port = 2375 } = config.links.interactive_brokers
    const containers = await interactive_brokers.get_docker_containers({
      host,
      port: docker_port
    })

    const ib_containers = containers.filter(
      (container) =>
        container.Image === config.ib_gateway_docker_image &&
        container.State === 'running'
    )

    for (const container of ib_containers) {
      await interactive_brokers.stop_docker_container({
        host,
        port: docker_port,
        id: container.Id
      })
      log(`docker container ${container.Id} stopped during cleanup`)
    }
  } catch (err) {
    log('Error during container cleanup:', err)
  }
}

// Setup cleanup handlers
const setup_cleanup_handlers = () => {
  // Handle SIGTERM
  process.on('SIGTERM', async () => {
    log('SIGTERM received, cleaning up...')
    await cleanup_containers()
    process.exit(0)
  })

  // Handle SIGINT (Ctrl+C)
  process.on('SIGINT', async () => {
    log('SIGINT received, cleaning up...')
    await cleanup_containers()
    process.exit(0)
  })
}

const main = async () => {
  setup_cleanup_handlers()

  let error
  try {
    const publicKey = argv.publicKey
    if (!publicKey) {
      console.log('missing --public-key')
      return
    }

    const credentials = config.links.interactive_brokers
    await import_interactive_brokers_accounts({
      publicKey,
      credentials,
      keep_alive: argv.keep_alive
    })
  } catch (err) {
    error = err
    console.log(error)
  }

  /* await db('jobs').insert({
   *   type: constants.jobs.EXAMPLE,
   *   succ: error ? 0 : 1,
   *   reason: error ? error.message : null,
   *   timestamp: Math.round(Date.now() / 1000)
   * })
   */

  // If keep_alive is not set, clean up containers before exit
  if (!argv.keep_alive) {
    await cleanup_containers()
  }

  process.exit()
}

if (isMain(import.meta.url)) {
  main()
}

export default import_interactive_brokers_accounts
