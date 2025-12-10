import dayjs from 'dayjs'

/**
 * Calculate close analysis for strategies
 * Determines cost to close, net P&L, and provides recommendations
 */
export const calculate_close_analysis = (strategies) => {
  return strategies.map((strategy) => {
    const analysis = {
      underlying: strategy.underlying,
      expiration: strategy.expiration,
      strategy_type: strategy.strategy_type,
      variation: strategy.variation,
      days_to_expiration: calculate_dte(strategy.expiration),
      close_cost: null,
      net_pnl: null,
      max_profit_remaining: null,
      risk_remaining: null,
      theta_per_day: null,
      profit_captured_pct: null,
      recommendation: null,
      recommendation_reason: null
    }

    // Calculate close cost from bid/ask
    const close_result = calculate_close_cost(strategy)
    analysis.close_cost = close_result.close_cost
    analysis.has_complete_data = close_result.has_complete_data

    // Calculate net P&L if closed now
    if (analysis.close_cost !== null) {
      // Net P&L = what we received/paid at entry + what we receive/pay to close
      // total_cost_basis is positive for net credit, negative for net debit
      analysis.net_pnl = strategy.total_cost_basis + analysis.close_cost
    }

    // Calculate theta (daily decay)
    analysis.theta_per_day = calculate_strategy_theta(strategy)

    // Calculate remaining profit/risk
    analysis.max_profit_remaining = calculate_remaining_profit(strategy)
    analysis.risk_remaining = calculate_remaining_risk(strategy)

    // Calculate profit captured percentage
    if (strategy.max_profit > 0 && analysis.net_pnl !== null) {
      analysis.profit_captured_pct =
        (analysis.net_pnl / strategy.max_profit) * 100
    }

    // Generate recommendation
    const rec = generate_recommendation(strategy, analysis)
    analysis.recommendation = rec.recommendation
    analysis.recommendation_reason = rec.reason

    return analysis
  })
}

/**
 * Calculate days to expiration
 */
const calculate_dte = (expiration) => {
  if (!expiration) return null

  // Expiration format is YYYYMMDD
  const exp_date = dayjs(expiration, 'YYYYMMDD')
  const today = dayjs()
  return exp_date.diff(today, 'day')
}

/**
 * Calculate cost to close a strategy
 * Long positions: sell at bid
 * Short positions: buy at ask
 */
const calculate_close_cost = (strategy) => {
  let close_cost = 0
  let has_complete_data = true

  for (const position of strategy.positions) {
    const contracts = Math.abs(position.quantity)
    const multiplier = 100 // Standard option multiplier

    // Get bid/ask from position (attached from market data)
    const bid = position.bid
    const ask = position.ask

    if (bid === null || ask === null) {
      // Fall back to current price if bid/ask not available
      if (position.current_price !== null) {
        const value = position.current_price * contracts * multiplier
        if (position.quantity > 0) {
          // Long: receive value when closing (sell)
          close_cost += value
        } else {
          // Short: pay value when closing (buy)
          close_cost -= value
        }
      } else {
        has_complete_data = false
      }
      continue
    }

    if (position.quantity > 0) {
      // Long position: sell at bid to close
      close_cost += bid * contracts * multiplier
    } else {
      // Short position: buy at ask to close
      close_cost -= ask * contracts * multiplier
    }
  }

  return {
    close_cost: has_complete_data || close_cost !== 0 ? close_cost : null,
    has_complete_data
  }
}

/**
 * Calculate total theta for strategy (daily P&L from time decay)
 * Positive theta = strategy benefits from time decay (short options)
 * Negative theta = strategy suffers from time decay (long options)
 */
const calculate_strategy_theta = (strategy) => {
  let total_theta = 0
  let has_theta = false

  for (const position of strategy.positions) {
    if (position.theta === null) continue

    has_theta = true
    const contracts = Math.abs(position.quantity)
    const multiplier = 100

    // Theta is per-share daily decay (negative for long, positive for short from holder's perspective)
    // IBKR reports theta as negative (option loses value)
    // For short positions, we want positive (we benefit from decay)
    if (position.quantity > 0) {
      // Long: theta hurts us (already negative from IBKR)
      total_theta += position.theta * contracts * multiplier
    } else {
      // Short: theta helps us (flip the sign)
      total_theta -= position.theta * contracts * multiplier
    }
  }

  return has_theta ? total_theta : null
}

/**
 * Calculate remaining profit potential from current state
 */
const calculate_remaining_profit = (strategy) => {
  if (strategy.remaining_profit_potential !== null) {
    return strategy.remaining_profit_potential
  }

  // For strategies without calculated remaining potential,
  // estimate from max profit minus current P&L
  if (
    strategy.max_profit !== null &&
    strategy.max_profit !== Infinity &&
    strategy.unrealized_pnl !== null
  ) {
    return Math.max(0, strategy.max_profit - strategy.unrealized_pnl)
  }

  return null
}

/**
 * Calculate remaining risk from current state
 */
const calculate_remaining_risk = (strategy) => {
  if (strategy.remaining_risk !== null) {
    return strategy.remaining_risk
  }

  // For undefined risk strategies
  if (strategy.max_risk === Infinity) {
    return Infinity
  }

  return strategy.max_risk
}

/**
 * Generate close/hold recommendation
 */
const generate_recommendation = (strategy, analysis) => {
  const {
    days_to_expiration,
    net_pnl,
    profit_captured_pct,
    theta_per_day,
    max_profit_remaining,
    risk_remaining
  } = analysis

  // At max profit
  if (strategy.status === 'MAX_PROFIT') {
    return {
      recommendation: 'CLOSE',
      reason: 'At max profit'
    }
  }

  // At max loss
  if (strategy.status === 'MAX_LOSS') {
    return {
      recommendation: 'CLOSE',
      reason: 'At max loss - cut losses'
    }
  }

  // Very high profit captured (>90%)
  if (profit_captured_pct !== null && profit_captured_pct >= 90) {
    return {
      recommendation: 'CLOSE',
      reason: `${profit_captured_pct.toFixed(0)}% of max profit captured`
    }
  }

  // Good profit captured (>75%)
  if (profit_captured_pct !== null && profit_captured_pct >= 75) {
    return {
      recommendation: 'CONSIDER_CLOSE',
      reason: `${profit_captured_pct.toFixed(0)}% captured, limited upside`
    }
  }

  // Risk/reward unfavorable (risk > 3x remaining profit)
  if (
    max_profit_remaining !== null &&
    risk_remaining !== null &&
    risk_remaining !== Infinity &&
    max_profit_remaining > 0
  ) {
    const risk_reward = risk_remaining / max_profit_remaining
    if (risk_reward > 3) {
      return {
        recommendation: 'CONSIDER_CLOSE',
        reason: `Risk/reward unfavorable (${risk_reward.toFixed(1)}:1)`
      }
    }
  }

  // Expiring soon with profit
  if (days_to_expiration !== null && days_to_expiration <= 7) {
    if (net_pnl !== null && net_pnl > 0) {
      return {
        recommendation: 'CLOSE',
        reason: `Expiring in ${days_to_expiration}d with profit`
      }
    }
    return {
      recommendation: 'MONITOR',
      reason: `Expiring in ${days_to_expiration}d`
    }
  }

  // Good theta decay and time remaining
  if (
    theta_per_day !== null &&
    theta_per_day > 0 &&
    days_to_expiration !== null &&
    days_to_expiration > 14
  ) {
    return {
      recommendation: 'HOLD',
      reason: `+$${theta_per_day.toFixed(
        0
      )}/day theta, ${days_to_expiration}d remaining`
    }
  }

  // Negative theta (long positions)
  if (theta_per_day !== null && theta_per_day < 0) {
    if (profit_captured_pct !== null && profit_captured_pct > 50) {
      return {
        recommendation: 'CONSIDER_CLOSE',
        reason: `Theta decay -$${Math.abs(theta_per_day).toFixed(0)}/day`
      }
    }
  }

  // Default
  if (profit_captured_pct !== null && profit_captured_pct > 0) {
    return {
      recommendation: 'HOLD',
      reason: `${profit_captured_pct.toFixed(0)}% captured, thesis intact`
    }
  }

  return {
    recommendation: 'HOLD',
    reason: 'Position within parameters'
  }
}
