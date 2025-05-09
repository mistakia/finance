// Delta thresholds for grouping position liability
const DELTA_THRESHOLDS = [
  0.01, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9
]

/**
 * Analyze uncovered put positions by delta thresholds
 * @param {Object} risk_analysis - Risk analysis output containing uncovered put positions
 * @returns {Object} Liability grouped by delta thresholds
 */
export const analyze_probability_risk = (risk_analysis) => {
  // Only analyze uncovered puts for delta liability table
  const uncovered_puts = risk_analysis.uncovered_put_positions || []
  const liability_by_delta = {}

  // Initialize delta threshold liabilities
  DELTA_THRESHOLDS.forEach((threshold) => {
    liability_by_delta[`delta_greater_than_${threshold}`] = 0
  })

  // Process each uncovered put
  uncovered_puts.forEach((position) => {
    if (!position.delta) return // Skip if no delta data

    const abs_delta = Math.abs(position.delta)
    const liability = position.liability

    // For put options, HIGHER delta means higher probability of assignment
    DELTA_THRESHOLDS.forEach((threshold) => {
      if (abs_delta >= threshold) {
        liability_by_delta[`delta_greater_than_${threshold}`] += liability
      }
    })
  })

  return {
    by_delta: liability_by_delta
  }
}

/**
 * Calculate expected value of positions based on probability
 * @param {Map} symbols_map - Map of symbols to position data
 * @returns {Object} Expected value calculations for positions
 */
export const calculate_expected_value = (symbols_map) => {
  const results = {
    total_expected_value: 0,
    by_symbol: new Map()
  }

  for (const [symbol, symbol_data] of symbols_map) {
    let symbol_expected_value = 0
    const positions_ev = []

    // Process option positions
    symbol_data.option_positions.forEach((position) => {
      if (!position.market_data?.delta) return

      const delta = position.market_data.delta
      const contracts = Math.abs(position.pos)
      const multiplier = position.contract.multiplier
      const is_long = position.pos > 0

      let probability, position_ev

      if (position.contract.right === 'C') {
        // For calls: delta approximates probability of expiring ITM
        probability = Math.abs(delta)

        // Expected value calculation
        if (is_long) {
          // Long call EV = probability * potential gain - (1-probability) * premium paid
          const potential_gain =
            (position.market_data.underlying_price - position.contract.strike) *
            contracts *
            multiplier
          const premium_paid = position.avgCost * contracts * multiplier
          position_ev =
            probability * Math.max(0, potential_gain) -
            (1 - probability) * premium_paid
        } else {
          // Short call EV = (1-probability) * premium received - probability * potential loss
          const potential_loss =
            (position.market_data.underlying_price - position.contract.strike) *
            contracts *
            multiplier
          const premium_received = position.avgCost * contracts * multiplier
          position_ev =
            (1 - probability) * premium_received -
            probability * Math.max(0, potential_loss)
        }
      } else {
        // For puts: delta (abs value) approximates probability of expiring ITM
        probability = Math.abs(delta)

        // Expected value calculation
        if (is_long) {
          // Long put EV = probability * potential gain - (1-probability) * premium paid
          const potential_gain =
            (position.contract.strike - position.market_data.underlying_price) *
            contracts *
            multiplier
          const premium_paid = position.avgCost * contracts * multiplier
          position_ev =
            probability * Math.max(0, potential_gain) -
            (1 - probability) * premium_paid
        } else {
          // Short put EV = (1-probability) * premium received - probability * potential loss
          const potential_loss =
            (position.contract.strike - position.market_data.underlying_price) *
            contracts *
            multiplier
          const premium_received = position.avgCost * contracts * multiplier
          position_ev =
            (1 - probability) * premium_received -
            probability * Math.max(0, potential_loss)
        }
      }

      positions_ev.push({
        symbol: position.contract.symbol,
        right: position.contract.right,
        strike: position.contract.strike,
        expiration: position.contract.lastTradeDateOrContractMonth,
        delta,
        probability: Math.abs(delta), // Use abs(delta) for both puts and calls
        expected_value: position_ev
      })

      symbol_expected_value += position_ev
    })

    results.by_symbol.set(symbol, {
      symbol,
      expected_value: symbol_expected_value,
      positions: positions_ev
    })

    results.total_expected_value += symbol_expected_value
  }

  return results
}
