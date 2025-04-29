// Identify option strategies based on position groupings
export const identify_strategies = (symbols_map) => {
  const strategies = []

  // eslint-disable-next-line no-unused-vars
  for (const [_, symbol_data] of symbols_map) {
    // Go through each expiration date group
    for (const [expiration, positions] of symbol_data.by_expiration) {
      if (positions.length === 0) continue

      // Sort positions by strike
      positions.sort((a, b) => a.contract.strike - b.contract.strike)

      const calls = positions.filter((p) => p.contract.right === 'C')
      const puts = positions.filter((p) => p.contract.right === 'P')
      const short_calls = calls.filter((p) => p.pos < 0)
      const long_calls = calls.filter((p) => p.pos > 0)
      const short_puts = puts.filter((p) => p.pos < 0)
      const long_puts = puts.filter((p) => p.pos > 0)

      const strategy = {
        underlying: symbol_data.symbol,
        expiration,
        positions: positions.map((p) => ({
          symbol: p.contract.symbol,
          right: p.contract.right,
          strike: p.contract.strike,
          quantity: p.pos,
          delta: p.market_data?.delta || null
        })),
        stock_position: symbol_data.total_shares,
        strategy_type: null,
        variation: null,
        max_risk: 0,
        max_profit: 0,
        breakeven_points: []
      }

      // Try to identify a known strategy pattern
      if (identify_call_spread_strategy(strategy, short_calls, long_calls)) {
        // Successfully identified a call spread
      } else if (
        identify_put_spread_strategy(strategy, short_puts, long_puts)
      ) {
        // Successfully identified a put spread
      } else if (
        identify_straddle_strategy(
          strategy,
          short_calls,
          short_puts,
          long_calls,
          long_puts
        )
      ) {
        // Successfully identified a straddle or strangle
      } else if (
        identify_covered_call_strategy(
          strategy,
          short_calls,
          symbol_data.total_shares
        )
      ) {
        // Successfully identified a covered call
      } else if (
        identify_iron_condor_strategy(
          strategy,
          short_calls,
          long_calls,
          short_puts,
          long_puts
        )
      ) {
        // Successfully identified an iron condor
      } else if (positions.length > 0) {
        // If no specific pattern is found but positions exist
        strategy.strategy_type = 'CUSTOM'
        calculate_custom_strategy_risk(strategy, positions)
      }

      if (strategy.strategy_type) {
        strategies.push(strategy)
      }
    }
  }

  return strategies
}

// Helper functions for strategy identification
const identify_call_spread_strategy = (strategy, short_calls, long_calls) => {
  if (short_calls.length !== 1 || long_calls.length !== 1) return false

  const short_call = short_calls[0]
  const long_call = long_calls[0]

  // Check if the number of contracts match
  if (Math.abs(short_call.pos) !== Math.abs(long_call.pos)) return false

  strategy.strategy_type = 'CALL_SPREAD'

  if (short_call.contract.strike < long_call.contract.strike) {
    // Bull call spread
    strategy.variation = 'BULL'

    const cost_basis =
      Math.abs(Math.abs(short_call.avgCost) - Math.abs(long_call.avgCost)) *
      Math.abs(short_call.pos) *
      short_call.contract.multiplier

    const width =
      (long_call.contract.strike - short_call.contract.strike) *
      Math.abs(short_call.pos) *
      short_call.contract.multiplier

    strategy.max_risk = cost_basis
    strategy.max_profit = width - cost_basis

    strategy.breakeven_points = [
      short_call.contract.strike +
        cost_basis / (Math.abs(short_call.pos) * short_call.contract.multiplier)
    ]
  } else {
    // Bear call spread
    strategy.variation = 'BEAR'

    const credit_received =
      Math.abs(Math.abs(short_call.avgCost) - Math.abs(long_call.avgCost)) *
      Math.abs(short_call.pos) *
      short_call.contract.multiplier

    const width =
      (short_call.contract.strike - long_call.contract.strike) *
      Math.abs(short_call.pos) *
      short_call.contract.multiplier

    strategy.max_profit = credit_received
    strategy.max_risk = width - credit_received

    strategy.breakeven_points = [
      short_call.contract.strike -
        credit_received /
          (Math.abs(short_call.pos) * short_call.contract.multiplier)
    ]
  }

  return true
}

const identify_put_spread_strategy = (strategy, short_puts, long_puts) => {
  if (short_puts.length !== 1 || long_puts.length !== 1) return false

  const short_put = short_puts[0]
  const long_put = long_puts[0]

  // Check if the number of contracts match
  if (Math.abs(short_put.pos) !== Math.abs(long_put.pos)) return false

  strategy.strategy_type = 'PUT_SPREAD'

  if (short_put.contract.strike > long_put.contract.strike) {
    // Bull put spread
    strategy.variation = 'BULL'

    const credit_received =
      Math.abs(Math.abs(short_put.avgCost) - Math.abs(long_put.avgCost)) *
      Math.abs(short_put.pos) *
      short_put.contract.multiplier

    const width =
      (short_put.contract.strike - long_put.contract.strike) *
      Math.abs(short_put.pos) *
      short_put.contract.multiplier

    strategy.max_profit = credit_received
    strategy.max_risk = width - credit_received

    strategy.breakeven_points = [
      short_put.contract.strike -
        credit_received /
          (Math.abs(short_put.pos) * short_put.contract.multiplier)
    ]
  } else {
    // Bear put spread
    strategy.variation = 'BEAR'

    const cost_basis =
      Math.abs(Math.abs(short_put.avgCost) - Math.abs(long_put.avgCost)) *
      Math.abs(short_put.pos) *
      short_put.contract.multiplier

    const width =
      (long_put.contract.strike - short_put.contract.strike) *
      Math.abs(short_put.pos) *
      short_put.contract.multiplier

    strategy.max_risk = cost_basis
    strategy.max_profit = width - cost_basis

    strategy.breakeven_points = [
      long_put.contract.strike -
        cost_basis / (Math.abs(short_put.pos) * short_put.contract.multiplier)
    ]
  }

  return true
}

const identify_straddle_strategy = (
  strategy,
  short_calls,
  short_puts,
  long_calls,
  long_puts
) => {
  // Short straddle: one short call and one short put at the same strike
  if (
    short_calls.length === 1 &&
    short_puts.length === 1 &&
    short_calls[0].contract.strike === short_puts[0].contract.strike
  ) {
    strategy.strategy_type = 'SHORT_STRADDLE'
    const call = short_calls[0]
    const put = short_puts[0]

    const credit_received =
      (Math.abs(call.avgCost) + Math.abs(put.avgCost)) *
      Math.min(Math.abs(call.pos), Math.abs(put.pos)) *
      call.contract.multiplier

    strategy.max_profit = credit_received
    strategy.max_risk = Infinity // Unlimited risk on the call side

    strategy.breakeven_points = [
      call.contract.strike -
        credit_received /
          2 /
          (Math.min(Math.abs(call.pos), Math.abs(put.pos)) *
            call.contract.multiplier),
      call.contract.strike +
        credit_received /
          2 /
          (Math.min(Math.abs(call.pos), Math.abs(put.pos)) *
            call.contract.multiplier)
    ]

    return true
  }

  // Long straddle: one long call and one long put at the same strike
  if (
    long_calls.length === 1 &&
    long_puts.length === 1 &&
    long_calls[0].contract.strike === long_puts[0].contract.strike
  ) {
    strategy.strategy_type = 'LONG_STRADDLE'
    const call = long_calls[0]
    const put = long_puts[0]

    const cost_basis =
      (Math.abs(call.avgCost) + Math.abs(put.avgCost)) *
      Math.min(Math.abs(call.pos), Math.abs(put.pos)) *
      call.contract.multiplier

    strategy.max_risk = cost_basis
    strategy.max_profit = Infinity // Unlimited profit potential on the call side

    strategy.breakeven_points = [
      call.contract.strike -
        cost_basis /
          2 /
          (Math.min(Math.abs(call.pos), Math.abs(put.pos)) *
            call.contract.multiplier),
      call.contract.strike +
        cost_basis /
          2 /
          (Math.min(Math.abs(call.pos), Math.abs(put.pos)) *
            call.contract.multiplier)
    ]

    return true
  }

  // Short strangle: one short call and one short put at different strikes
  if (
    short_calls.length === 1 &&
    short_puts.length === 1 &&
    short_calls[0].contract.strike !== short_puts[0].contract.strike
  ) {
    strategy.strategy_type = 'SHORT_STRANGLE'
    const call = short_calls[0]
    const put = short_puts[0]

    const credit_received =
      (Math.abs(call.avgCost) + Math.abs(put.avgCost)) *
      Math.min(Math.abs(call.pos), Math.abs(put.pos)) *
      call.contract.multiplier

    strategy.max_profit = credit_received
    strategy.max_risk = Infinity // Unlimited risk on the call side

    strategy.breakeven_points = [
      put.contract.strike -
        credit_received /
          (Math.min(Math.abs(call.pos), Math.abs(put.pos)) *
            call.contract.multiplier),
      call.contract.strike +
        credit_received /
          (Math.min(Math.abs(call.pos), Math.abs(put.pos)) *
            call.contract.multiplier)
    ]

    return true
  }

  return false
}

const identify_covered_call_strategy = (strategy, short_calls, shares_held) => {
  if (short_calls.length !== 1 || shares_held <= 0) return false

  const call = short_calls[0]
  const shares_needed = Math.abs(call.pos) * call.contract.multiplier

  if (shares_held < shares_needed) return false

  strategy.strategy_type = 'COVERED_CALL'

  const credit_received =
    Math.abs(call.avgCost) * Math.abs(call.pos) * call.contract.multiplier

  // Max profit is limited to the strike price gain plus premium
  strategy.max_profit = call.contract.strike * shares_needed + credit_received

  // Max risk is limited to downside on the stock (assuming stock goes to zero)
  // But this is reduced by the premium received
  strategy.max_risk = call.avgCost * shares_needed - credit_received

  strategy.breakeven_points = [call.avgCost - credit_received / shares_needed]

  return true
}

const identify_iron_condor_strategy = (
  strategy,
  short_calls,
  long_calls,
  short_puts,
  long_puts
) => {
  if (
    short_calls.length !== 1 ||
    long_calls.length !== 1 ||
    short_puts.length !== 1 ||
    long_puts.length !== 1
  )
    return false

  const short_call = short_calls[0]
  const long_call = long_calls[0]
  const short_put = short_puts[0]
  const long_put = long_puts[0]

  // Check for proper structure: long put < short put < short call < long call
  if (
    !(
      long_put.contract.strike < short_put.contract.strike &&
      short_put.contract.strike < short_call.contract.strike &&
      short_call.contract.strike < long_call.contract.strike
    )
  ) {
    return false
  }

  strategy.strategy_type = 'IRON_CONDOR'

  const call_credit = Math.abs(short_call.avgCost) - Math.abs(long_call.avgCost)
  const put_credit = Math.abs(short_put.avgCost) - Math.abs(long_put.avgCost)

  const total_credit =
    (call_credit + put_credit) *
    Math.min(
      Math.abs(short_call.pos),
      Math.abs(long_call.pos),
      Math.abs(short_put.pos),
      Math.abs(long_put.pos)
    ) *
    short_call.contract.multiplier

  const call_spread_width =
    long_call.contract.strike - short_call.contract.strike
  const put_spread_width = short_put.contract.strike - long_put.contract.strike

  const max_risk =
    Math.max(call_spread_width, put_spread_width) *
      Math.min(
        Math.abs(short_call.pos),
        Math.abs(long_call.pos),
        Math.abs(short_put.pos),
        Math.abs(long_put.pos)
      ) *
      short_call.contract.multiplier -
    total_credit

  strategy.max_profit = total_credit
  strategy.max_risk = max_risk

  strategy.breakeven_points = [
    short_put.contract.strike -
      total_credit /
        (Math.min(
          Math.abs(short_call.pos),
          Math.abs(long_call.pos),
          Math.abs(short_put.pos),
          Math.abs(long_put.pos)
        ) *
          short_call.contract.multiplier),
    short_call.contract.strike +
      total_credit /
        (Math.min(
          Math.abs(short_call.pos),
          Math.abs(long_call.pos),
          Math.abs(short_put.pos),
          Math.abs(long_put.pos)
        ) *
          short_call.contract.multiplier)
  ]

  return true
}

const calculate_custom_strategy_risk = (strategy, positions) => {
  // For custom strategies, just estimate based on short positions
  // This is a simplification - real risk calculation would be more complex

  strategy.max_risk = positions
    .filter((p) => p.pos < 0)
    .reduce((acc, p) => {
      // For short calls, risk is infinite
      if (p.contract.right === 'C') {
        return Infinity
      }

      // For short puts, risk is strike * contracts * multiplier
      return acc + p.contract.strike * Math.abs(p.pos) * p.contract.multiplier
    }, 0)

  // Estimate max profit based on option prices
  strategy.max_profit = positions.reduce((acc, p) => {
    const value = p.avgCost * Math.abs(p.pos) * p.contract.multiplier
    return p.pos < 0 ? acc + value : acc - value
  }, 0)

  return true
}
