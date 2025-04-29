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
    const cash_table = new Table({
      head: ['Metric', 'Value'],
      style: { head: ['cyan'] }
    })
    cash_table.push(
      ['Net Liquidation', account_info.NetLiquidation],
      ['Total Cash', account_info.TotalCashValue],
      ['Gross Position', account_info.GrossPositionValue]
    )

    const unlimited_risk_table = new Table({
      head: ['Symbol', 'Strike', 'Expiration', 'Contracts', 'Shares Needed'],
      style: { head: ['cyan'] }
    })
    account_info.unlimited_risk_positions.forEach((pos) => {
      unlimited_risk_table.push([
        pos.symbol,
        pos.strike,
        pos.expiration,
        pos.contracts,
        pos.shares_needed
      ])
    })

    const limited_risk_table = new Table({
      head: [
        'Symbol',
        'Strike',
        'Expiration',
        'Contracts',
        'Shares Held',
        'Shares Needed',
        'Liability',
        'Risk Type'
      ],
      style: { head: ['cyan'] }
    })
    account_info.limited_risk_positions.forEach((pos) => {
      limited_risk_table.push([
        pos.symbol,
        pos.strike,
        pos.expiration,
        pos.contracts,
        pos.shares_held,
        pos.shares_needed,
        pos.liability,
        pos.risk_type
      ])
    })

    const liability_table = new Table({
      head: ['Liability Type', 'Amount'],
      style: { head: ['cyan'] }
    })
    liability_table.push(
      ['Option Cash', account_info.option_cash_liability],
      ['Uncovered Puts', account_info.total_uncovered_put_liability],
      ['Total Strategy Risk', account_info.total_strategy_risk]
    )

    const probability_table = new Table({
      head: ['Probability Threshold', 'Liability'],
      style: { head: ['cyan'] }
    })
    Object.entries(account_info.liability_by_probability).forEach(
      ([threshold, liability]) => {
        probability_table.push([threshold, liability])
      }
    )

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
    account_info.strategy_liabilities.forEach((strat) => {
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
        strat.strategy_type,
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

    // Create a new table for symbol-specific risk analysis
    const symbol_risk_table = new Table({
      head: [
        'Symbol',
        'Uncovered Calls',
        'Uncovered Puts',
        'Holdings',
        'Total Risk'
      ],
      style: { head: ['cyan'] }
    })

    // Group positions by symbol
    const symbols = new Map()

    // First collect all stock positions
    account_info.positions.forEach((position) => {
      if (position.contract.secType === 'STK') {
        const symbol = position.contract.symbol
        if (!symbols.has(symbol)) {
          symbols.set(symbol, {
            symbol,
            stock_position: {
              quantity: position.pos,
              cost_basis: position.avgCost
            },
            uncovered_calls: [],
            uncovered_puts: [],
            covered_calls: []
          })
        } else {
          symbols.get(symbol).stock_position = {
            quantity: position.pos,
            cost_basis: position.avgCost
          }
        }
      }
    })

    // Add option positions to the appropriate categories
    account_info.unlimited_risk_positions.forEach((pos) => {
      if (!symbols.has(pos.symbol)) {
        symbols.set(pos.symbol, {
          symbol: pos.symbol,
          stock_position: null,
          uncovered_calls: [],
          uncovered_puts: [],
          covered_calls: []
        })
      }

      symbols.get(pos.symbol).uncovered_calls.push({
        strike: pos.strike,
        expiration: pos.expiration,
        contracts: pos.contracts
      })
    })

    account_info.limited_risk_positions.forEach((pos) => {
      if (!symbols.has(pos.symbol)) {
        symbols.set(pos.symbol, {
          symbol: pos.symbol,
          stock_position: null,
          uncovered_calls: [],
          uncovered_puts: [],
          covered_calls: []
        })
      }

      const symbol_data = symbols.get(pos.symbol)

      if (pos.risk_type === 'COVERED') {
        symbol_data.covered_calls.push({
          strike: pos.strike,
          expiration: pos.expiration,
          contracts: pos.contracts
        })
      } else if (pos.risk_type === 'UNCOVERED_PUT') {
        symbol_data.uncovered_puts.push({
          strike: pos.strike,
          expiration: pos.expiration,
          contracts: pos.contracts,
          liability: pos.liability
        })
      }
    })

    // Calculate total risk and populate the symbol risk table
    symbols.forEach((symbol_data) => {
      const holdings_value = symbol_data.stock_position
        ? symbol_data.stock_position.quantity *
          symbol_data.stock_position.cost_basis
        : 0

      const uncovered_calls_formatted = symbol_data.uncovered_calls
        .map((call) => `${call.strike} ${call.expiration} (${call.contracts})`)
        .join('\n')

      const uncovered_puts_formatted = symbol_data.uncovered_puts
        .map((put) => `${put.strike} ${put.expiration} (${put.contracts})`)
        .join('\n')

      const holdings_formatted = symbol_data.stock_position
        ? `${symbol_data.stock_position.quantity} shares @ ${symbol_data.stock_position.cost_basis}`
        : 'None'

      const covered_calls_formatted = symbol_data.covered_calls.length
        ? `\nCovered Calls:\n${symbol_data.covered_calls
            .map(
              (call) => `${call.strike} ${call.expiration} (${call.contracts})`
            )
            .join('\n')}`
        : ''

      const total_put_liability = symbol_data.uncovered_puts.reduce(
        (sum, put) => sum + (put.liability || 0),
        0
      )

      const total_risk = holdings_value + total_put_liability

      symbol_risk_table.push([
        symbol_data.symbol,
        uncovered_calls_formatted || 'None',
        uncovered_puts_formatted || 'None',
        holdings_formatted + covered_calls_formatted,
        total_risk.toFixed(2)
      ])
    })

    console.log('\nCash Balances:')
    console.log(cash_table.toString())
    console.log('\nAll Positions:')
    console.log(positions_table.toString())
    console.log('\nUnlimited Risk Positions:')
    console.log(unlimited_risk_table.toString())
    console.log('\nLimited Risk Positions:')
    console.log(limited_risk_table.toString())
    console.log('\nLiabilities:')
    console.log(liability_table.toString())
    console.log('\nLiability by Probability:')
    console.log(probability_table.toString())
    console.log('\nStrategies:')
    console.log(strategy_table.toString())
    console.log('\nSymbol Risk Analysis:')
    console.log(symbol_risk_table.toString())

    const asset = await addAsset({ asset_type: 'currency', symbol: 'USD' })
    const cash_balance = Number(account_info.TotalCashValue)

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
