import { EventName } from '@stoqey/ib'
import debug from 'debug'

const log = debug('interactive-brokers:positions')

export const account_summary_tags = [
  'NetLiquidation',
  'TotalCashValue',
  'SettledCash',
  'GrossPositionValue'
]

export const get_account_summary = (ib) =>
  new Promise((resolve, reject) => {
    const summary = new Map()

    const cleanupListeners = []

    const accountSummaryHandler = (req_id, account, tag, value) => {
      if (!summary.has(tag)) {
        summary.set(tag, value)
      }
    }

    const accountSummaryEndHandler = () => {
      cleanup()
      resolve(summary)
    }

    const errorHandler = (err) => {
      cleanup()
      reject(err)
    }

    const cleanup = () => {
      cleanupListeners.forEach((remove) => remove())
    }

    cleanupListeners.push(
      () => ib.api.off(EventName.accountSummary, accountSummaryHandler),
      () => ib.api.off(EventName.accountSummaryEnd, accountSummaryEndHandler),
      () => ib.api.off(EventName.error, errorHandler)
    )

    ib.api.on(EventName.accountSummary, accountSummaryHandler)
    ib.api.on(EventName.accountSummaryEnd, accountSummaryEndHandler)
    ib.api.on(EventName.error, errorHandler)

    ib.getAccountSummary('All', account_summary_tags.join(',')).subscribe({
      error: (err) => {
        log('Error in account summary subscription:', err)
        cleanup()
        reject(err)
      }
    })
  })

export const get_account_positions = (ib) =>
  new Promise((resolve, reject) => {
    const positions = []
    const cleanupListeners = []

    const positionHandler = (account, contract, pos, avgCost) => {
      positions.push({ account, contract, pos, avgCost })
    }

    const positionEndHandler = () => {
      cleanup()
      resolve(positions)
    }

    const errorHandler = (err) => {
      cleanup()
      reject(err)
    }

    const cleanup = () => {
      cleanupListeners.forEach((remove) => remove())
    }

    cleanupListeners.push(
      () => ib.api.off(EventName.position, positionHandler),
      () => ib.api.off(EventName.positionEnd, positionEndHandler),
      () => ib.api.off(EventName.error, errorHandler)
    )

    ib.api.on(EventName.position, positionHandler)
    ib.api.on(EventName.positionEnd, positionEndHandler)
    ib.api.on(EventName.error, errorHandler)

    ib.getPositions().subscribe({
      error: errorHandler
    })
  })

// Group positions by underlying and expiration for strategy analysis
export const group_positions_by_strategy = (positions) => {
  const strategies = new Map()

  // First group by underlying and expiration
  positions.forEach((position) => {
    if (position.contract.secType !== 'OPT') return

    const key = `${position.contract.symbol}_${position.contract.lastTradeDateOrContractMonth}`
    if (!strategies.has(key)) {
      strategies.set(key, {
        underlying: position.contract.symbol,
        expiration: position.contract.lastTradeDateOrContractMonth,
        positions: [],
        stock_position: null,
        strategy_type: null,
        max_risk: 0,
        max_profit: 0,
        breakeven_points: []
      })
    }

    const strategy = strategies.get(key)
    strategy.positions.push(position)

    // Add stock position if available
    if (position.contract.secType === 'STK') {
      strategy.stock_position = position
    }
  })

  // Analyze each strategy group
  // eslint-disable-next-line no-unused-vars
  for (const [unused_key, strategy] of strategies) {
    // Sort positions by strike price
    strategy.positions.sort((a, b) => a.contract.strike - b.contract.strike)

    // Identify strategy type and calculate risk metrics
    const calls = strategy.positions.filter((p) => p.contract.right === 'C')
    const puts = strategy.positions.filter((p) => p.contract.right === 'P')
    const short_calls = calls.filter((p) => p.pos < 0)
    const long_calls = calls.filter((p) => p.pos > 0)
    const short_puts = puts.filter((p) => p.pos < 0)
    const long_puts = puts.filter((p) => p.pos > 0)

    // Identify common strategies
    if (short_calls.length === 1 && long_calls.length === 1) {
      strategy.strategy_type = 'CALL_SPREAD'
      const short_call = short_calls[0]
      const long_call = long_calls[0]
      strategy.max_risk =
        (long_call.contract.strike - short_call.contract.strike) *
        Math.abs(short_call.pos) *
        short_call.contract.multiplier
      strategy.max_profit =
        (long_call.contract.strike - short_call.contract.strike) *
        Math.abs(short_call.pos) *
        short_call.contract.multiplier
      strategy.breakeven_points = [
        short_call.contract.strike +
          strategy.max_profit /
            (Math.abs(short_call.pos) * short_call.contract.multiplier)
      ]
    } else if (short_puts.length === 1 && long_puts.length === 1) {
      strategy.strategy_type = 'PUT_SPREAD'
      const short_put = short_puts[0]
      const long_put = long_puts[0]
      strategy.max_risk =
        (short_put.contract.strike - long_put.contract.strike) *
        Math.abs(short_put.pos) *
        short_put.contract.multiplier
      strategy.max_profit =
        (short_put.contract.strike - long_put.contract.strike) *
        Math.abs(short_put.pos) *
        short_put.contract.multiplier
      strategy.breakeven_points = [
        short_put.contract.strike -
          strategy.max_profit /
            (Math.abs(short_put.pos) * short_put.contract.multiplier)
      ]
    } else if (short_calls.length === 1 && short_puts.length === 1) {
      strategy.strategy_type = 'STRADDLE'
      const call = short_calls[0]
      const put = short_puts[0]
      strategy.max_risk = Infinity // Unlimited risk on both sides
      strategy.breakeven_points = [
        call.contract.strike +
          strategy.max_profit / (Math.abs(call.pos) * call.contract.multiplier),
        put.contract.strike -
          strategy.max_profit / (Math.abs(put.pos) * put.contract.multiplier)
      ]
    } else if (short_calls.length === 1 && strategy.stock_position) {
      strategy.strategy_type = 'COVERED_CALL'
      const call = short_calls[0]
      const shares_held = strategy.stock_position.pos
      const shares_needed = Math.abs(call.pos) * call.contract.multiplier
      if (shares_held >= shares_needed) {
        strategy.max_risk = 0 // Fully covered
      } else {
        strategy.max_risk = call.contract.strike * (shares_needed - shares_held)
      }
      strategy.max_profit =
        call.contract.strike * Math.abs(call.pos) * call.contract.multiplier
      strategy.breakeven_points = [
        strategy.stock_position.avgCost - strategy.max_profit / shares_held
      ]
    } else {
      strategy.strategy_type = 'CUSTOM'
      // Calculate max risk as sum of all short positions
      strategy.max_risk = strategy.positions
        .filter((p) => p.pos < 0)
        .reduce(
          (acc, p) =>
            acc + p.contract.strike * Math.abs(p.pos) * p.contract.multiplier,
          0
        )
    }
  }

  return strategies
}

// Calculate option liabilities considering covered positions
export const calculate_option_liabilities = (positions, stock_positions) => {
  const result = {
    max_liability: 0,
    unlimited_risk_positions: [],
    limited_risk_positions: [],
    uncovered_put_liabilities: [],
    total_uncovered_put_liability: 0
  }

  // First group puts by underlying and expiration to identify spreads
  const put_positions_by_expiration = new Map()
  positions.forEach((position) => {
    if (position.contract.secType !== 'OPT' || position.contract.right !== 'P')
      return

    const key = `${position.contract.symbol}_${position.contract.lastTradeDateOrContractMonth}`
    if (!put_positions_by_expiration.has(key)) {
      put_positions_by_expiration.set(key, {
        underlying: position.contract.symbol,
        expiration: position.contract.lastTradeDateOrContractMonth,
        short_puts: [],
        long_puts: []
      })
    }

    const group = put_positions_by_expiration.get(key)
    if (position.pos < 0) {
      group.short_puts.push(position)
    } else {
      group.long_puts.push(position)
    }
  })

  positions.forEach((position) => {
    if (position.contract.secType !== 'OPT' || position.pos >= 0) return

    const stock_position = stock_positions.get(position.contract.symbol)
    const shares_held = stock_position ? stock_position.pos : 0
    const contracts = Math.abs(position.pos)
    const shares_needed = contracts * position.contract.multiplier

    const position_info = {
      symbol: position.contract.symbol,
      right: position.contract.right,
      strike: position.contract.strike,
      expiration: position.contract.lastTradeDateOrContractMonth,
      contracts,
      shares_held,
      shares_needed,
      liability: 0
    }

    if (position.contract.right === 'C') {
      if (shares_held >= shares_needed) {
        // Fully covered call - no liability
        position_info.liability = 0
        position_info.risk_type = 'COVERED'
        result.limited_risk_positions.push(position_info)
      } else if (shares_held > 0) {
        // Partially covered call
        const uncovered_contracts =
          (shares_needed - shares_held) / position.contract.multiplier
        position_info.liability =
          position.contract.strike *
          uncovered_contracts *
          position.contract.multiplier
        position_info.risk_type = 'PARTIALLY_COVERED'
        result.limited_risk_positions.push(position_info)
        result.max_liability += position_info.liability
      } else {
        // Naked call - unlimited risk
        position_info.liability = Infinity
        position_info.risk_type = 'UNLIMITED'
        result.unlimited_risk_positions.push(position_info)
      }
    } else {
      // Put options
      position_info.liability =
        position.contract.strike * contracts * position.contract.multiplier

      // Check if this put is part of a spread
      const key = `${position.contract.symbol}_${position.contract.lastTradeDateOrContractMonth}`
      const put_group = put_positions_by_expiration.get(key)
      const is_spread = put_group && put_group.long_puts.length > 0

      if (is_spread) {
        position_info.risk_type = 'SPREAD'
        result.limited_risk_positions.push(position_info)
        result.max_liability += position_info.liability
      } else {
        position_info.risk_type = 'UNCOVERED_PUT'
        result.limited_risk_positions.push(position_info)
        result.max_liability += position_info.liability
        result.uncovered_put_liabilities.push(position_info)
        result.total_uncovered_put_liability += position_info.liability
      }
    }
  })

  return result
}
