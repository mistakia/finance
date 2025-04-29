// Analyze risk for each position based on position type and coverage
export const analyze_position_risk = (symbols_map) => {
  const result = {
    unlimited_risk_positions: [],
    limited_risk_positions: [],
    uncovered_put_liabilities: [],
    total_uncovered_put_liability: 0,
    option_cash_liability: 0
  }

  // eslint-disable-next-line no-unused-vars
  for (const [_, symbol_data] of symbols_map) {
    // Analyze short calls coverage
    symbol_data.short_calls.forEach((call_position) => {
      const contracts = Math.abs(call_position.pos)
      const shares_needed = contracts * call_position.contract.multiplier

      // Use coverage info if available from base analysis
      const coverage = call_position.coverage || {
        shares_covered: 0,
        coverage_type:
          symbol_data.total_shares >= shares_needed
            ? 'FULL'
            : symbol_data.total_shares > 0
            ? 'PARTIAL'
            : 'NONE'
      }

      const position_info = {
        symbol: call_position.contract.symbol,
        right: call_position.contract.right,
        strike: call_position.contract.strike,
        expiration: call_position.contract.lastTradeDateOrContractMonth,
        contracts,
        shares_held: symbol_data.total_shares,
        shares_needed,
        delta: call_position.market_data?.delta || null
      }

      if (coverage.coverage_type === 'FULL') {
        // Fully covered call
        position_info.liability = 0
        position_info.risk_type = 'COVERED'
        result.limited_risk_positions.push(position_info)
      } else if (coverage.coverage_type === 'PARTIAL') {
        // Partially covered call
        const uncovered_contracts =
          (shares_needed - symbol_data.total_shares) /
          call_position.contract.multiplier
        position_info.liability =
          call_position.contract.strike *
          uncovered_contracts *
          call_position.contract.multiplier
        position_info.risk_type = 'PARTIALLY_COVERED'
        result.limited_risk_positions.push(position_info)
        result.option_cash_liability += position_info.liability
      } else {
        // Naked call - unlimited risk
        position_info.liability = Infinity
        position_info.risk_type = 'UNLIMITED'
        result.unlimited_risk_positions.push(position_info)
      }
    })

    // Analyze put risk
    symbol_data.short_puts.forEach((put_position) => {
      const contracts = Math.abs(put_position.pos)
      const position_info = {
        symbol: put_position.contract.symbol,
        right: put_position.contract.right,
        strike: put_position.contract.strike,
        expiration: put_position.contract.lastTradeDateOrContractMonth,
        contracts,
        shares_held: symbol_data.total_shares,
        shares_needed: 0,
        delta: put_position.market_data?.delta || null
      }

      // Calculate put liability
      position_info.liability =
        put_position.contract.strike *
        contracts *
        put_position.contract.multiplier

      // Check if this put is part of a spread
      const has_long_put_same_expiry = symbol_data.long_puts.some(
        (p) =>
          p.contract.lastTradeDateOrContractMonth ===
          put_position.contract.lastTradeDateOrContractMonth
      )

      if (has_long_put_same_expiry) {
        position_info.risk_type = 'SPREAD'
        result.limited_risk_positions.push(position_info)
      } else {
        position_info.risk_type = 'UNCOVERED_PUT'
        result.limited_risk_positions.push(position_info)
        result.uncovered_put_liabilities.push(position_info)
        result.total_uncovered_put_liability += position_info.liability
      }

      result.option_cash_liability += position_info.liability
    })
  }

  return result
}

// Calculate total liability by risk type
export const calculate_total_liability = (risk_analysis) => {
  const total = {
    unlimited_risk_count: risk_analysis.unlimited_risk_positions.length,
    limited_risk_total: risk_analysis.option_cash_liability,
    uncovered_put_total: risk_analysis.total_uncovered_put_liability,
    by_symbol: new Map()
  }

  // Group liabilities by symbol
  const all_positions = [
    ...risk_analysis.unlimited_risk_positions,
    ...risk_analysis.limited_risk_positions
  ]

  all_positions.forEach((position) => {
    if (!total.by_symbol.has(position.symbol)) {
      total.by_symbol.set(position.symbol, {
        symbol: position.symbol,
        unlimited_risk: 0,
        limited_risk: 0,
        total_liability: 0
      })
    }

    const symbol_data = total.by_symbol.get(position.symbol)

    if (position.risk_type === 'UNLIMITED') {
      symbol_data.unlimited_risk += 1
      symbol_data.total_liability = Infinity
    } else {
      symbol_data.limited_risk += position.liability
      if (symbol_data.total_liability !== Infinity) {
        symbol_data.total_liability += position.liability
      }
    }
  })

  return total
}

// Calculate exposure based on delta values if available
export const calculate_delta_exposure = (symbols_map) => {
  const exposure = {
    delta_dollars: 0,
    gamma_exposure: 0,
    by_symbol: new Map()
  }

  for (const [symbol, symbol_data] of symbols_map) {
    let symbol_delta_dollars = 0
    let symbol_gamma_exposure = 0
    const stock_price = symbol_data.market_data?.price || 0

    // Calculate stock delta exposure (always 1.0 delta per share)
    if (symbol_data.total_shares !== 0 && stock_price > 0) {
      const stock_delta_dollars = symbol_data.total_shares * stock_price
      symbol_delta_dollars += stock_delta_dollars
    }

    // Calculate option delta exposure
    symbol_data.option_positions.forEach((position) => {
      if (position.market_data?.delta && stock_price > 0) {
        const contracts = Math.abs(position.pos)
        const multiplier = position.contract.multiplier || 100
        const delta = position.market_data.delta
        const gamma = position.market_data.gamma || 0

        // Delta dollars = delta * underlying price * position size * multiplier * direction
        const position_delta_dollars =
          delta * stock_price * contracts * multiplier * Math.sign(position.pos)
        symbol_delta_dollars += position_delta_dollars

        // Gamma exposure = gamma * (underlying price^2) * position size * multiplier / 100 * direction
        const position_gamma_exposure =
          ((gamma * (stock_price * stock_price) * contracts * multiplier) /
            100) *
          Math.sign(position.pos)
        symbol_gamma_exposure += position_gamma_exposure
      }
    })

    exposure.delta_dollars += symbol_delta_dollars
    exposure.gamma_exposure += symbol_gamma_exposure

    exposure.by_symbol.set(symbol, {
      symbol,
      delta_dollars: symbol_delta_dollars,
      gamma_exposure: symbol_gamma_exposure
    })
  }

  return exposure
}
