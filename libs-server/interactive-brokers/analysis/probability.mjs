// Default probability thresholds to analyze
const DEFAULT_THRESHOLDS = [0.01, 0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9]

// Analyze position risk by probability thresholds
export const analyze_probability_risk = (
  symbols_map,
  thresholds = DEFAULT_THRESHOLDS
) => {
  const liability_by_probability = {}

  // Initialize threshold liabilities
  thresholds.forEach((threshold) => {
    liability_by_probability[
      `total_liability_greater_than_${threshold * 100}pct_prob`
    ] = 0
  })

  // Initialize breakdowns by symbol
  const symbol_breakdown = new Map()

  for (const [symbol, symbol_data] of symbols_map) {
    // Track each symbol's liabilities separately
    symbol_breakdown.set(symbol, {
      symbol,
      thresholds: Object.fromEntries(
        thresholds.map((threshold) => [`${threshold * 100}pct`, 0])
      ),
      option_positions: []
    })

    // Analyze each option position with market data
    symbol_data.option_positions.forEach((position) => {
      if (!position.market_data?.delta || position.pos >= 0) {
        return // Skip positions without market data or long positions
      }

      const delta = position.market_data.delta
      const total_shares = symbol_data.total_shares
      const contracts = Math.abs(position.pos)
      const shares_needed = contracts * position.contract.multiplier

      // Calculate position-specific metrics
      const position_metrics = {
        symbol: position.contract.symbol,
        right: position.contract.right,
        strike: position.contract.strike,
        expiration: position.contract.lastTradeDateOrContractMonth,
        contracts,
        delta,
        probability:
          position.contract.right === 'P'
            ? 1 - Math.abs(delta) // For puts
            : Math.abs(delta), // For calls
        liabilities_by_threshold: {}
      }

      thresholds.forEach((threshold) => {
        let liability = 0

        if (position_metrics.probability >= threshold) {
          if (
            position.contract.right === 'C' &&
            total_shares >= shares_needed
          ) {
            // Call is fully covered, no liability
            liability = 0
          } else if (position.contract.right === 'C' && total_shares > 0) {
            // Call is partially covered
            const uncovered_contracts =
              (shares_needed - total_shares) / position.contract.multiplier
            liability =
              position.contract.strike *
              uncovered_contracts *
              position.contract.multiplier
          } else {
            // Put or uncovered call
            liability =
              position.contract.strike *
              contracts *
              position.contract.multiplier
          }

          // Update global liability for this threshold
          liability_by_probability[
            `total_liability_greater_than_${threshold * 100}pct_prob`
          ] += liability

          // Update symbol-specific liability
          const symbol_data = symbol_breakdown.get(symbol)
          symbol_data.thresholds[`${threshold * 100}pct`] += liability
        }

        position_metrics.liabilities_by_threshold[`${threshold * 100}pct`] =
          liability
      })

      // Add position to symbol breakdown
      symbol_breakdown.get(symbol).option_positions.push(position_metrics)
    })
  }

  return {
    by_threshold: liability_by_probability,
    by_symbol: Array.from(symbol_breakdown.values())
  }
}

// Calculate expected value of positions based on probability
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
        // For puts: 1-delta approximates probability of expiring ITM
        probability = 1 - Math.abs(delta)

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
        probability:
          position.contract.right === 'C'
            ? Math.abs(delta)
            : 1 - Math.abs(delta),
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
