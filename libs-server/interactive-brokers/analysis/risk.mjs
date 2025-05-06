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
    // Track which long calls have been used for coverage
    const used_long_calls = new Map()
    const used_long_puts = new Map()

    // Analyze short calls coverage
    symbol_data.short_calls.forEach((call_position) => {
      const contracts = Math.abs(call_position.pos)
      const shares_needed = contracts * call_position.contract.multiplier

      // Determine shares available for coverage
      let remaining_shares = symbol_data.total_shares

      // Find protective long calls with the same expiration
      const protective_long_calls = symbol_data.long_calls.filter(
        (p) =>
          p.contract.lastTradeDateOrContractMonth ===
            call_position.contract.lastTradeDateOrContractMonth &&
          !used_long_calls.has(p.contract.conId)
      )

      const position_info = {
        symbol: call_position.contract.symbol,
        right: call_position.contract.right,
        strike: call_position.contract.strike,
        expiration: call_position.contract.lastTradeDateOrContractMonth,
        contracts,
        shares_held: symbol_data.total_shares,
        shares_needed,
        delta: call_position.market_data?.delta || null,
        unlimited_risk: false
      }

      // Calculate coverage and risk
      if (remaining_shares >= shares_needed) {
        // Fully covered by shares
        position_info.risk_type = 'COVERED_BY_SHARES'
        position_info.liability = 0
        position_info.covered_amount = shares_needed
        remaining_shares -= shares_needed
      } else if (protective_long_calls.length > 0) {
        // Covered by long options
        position_info.risk_type = 'SPREAD'

        // Calculate max loss for the spread
        // For call spreads, we want the long call with the highest strike price
        // that is lower than the short call strike
        const long_calls_lower_strike = protective_long_calls.filter(
          (c) => c.contract.strike < call_position.contract.strike
        )

        let protective_call
        let is_vertical_spread = false
        let is_diagonal_spread = false

        if (long_calls_lower_strike.length > 0) {
          // Sort by strike (highest first) to find best protection
          const sorted_protective_calls = [...long_calls_lower_strike].sort(
            (a, b) => b.contract.strike - a.contract.strike
          )
          protective_call = sorted_protective_calls[0]

          // Vertical spread if long call strike < short call strike
          is_vertical_spread = true
        } else {
          // If no lower strike calls, use any long call with same expiration
          // This includes when long call strike > short call strike (cash secured)
          const sorted_protective_calls = [...protective_long_calls].sort(
            (a, b) => a.contract.strike - b.contract.strike
          )
          protective_call = sorted_protective_calls[0]

          // This is a diagonal spread if long call strike > short call strike
          is_diagonal_spread =
            protective_call.contract.strike > call_position.contract.strike
        }

        // Mark this long call as used for coverage
        used_long_calls.set(protective_call.contract.conId, true)

        // Calculate spread risk based on spread type
        let max_strike_diff

        if (is_vertical_spread) {
          // For vertical call spreads, risk is short strike - long strike
          max_strike_diff =
            call_position.contract.strike - protective_call.contract.strike
          position_info.spread_type = 'VERTICAL'
        } else if (is_diagonal_spread) {
          // For a diagonal call spread where long strike > short strike,
          // the risk is more limited and can be calculated differently
          max_strike_diff = 0 // There's no upside risk when long call strike > short call strike
          position_info.spread_type = 'DIAGONAL'
        } else {
          // Other spread types
          max_strike_diff = Math.max(
            0,
            call_position.contract.strike - protective_call.contract.strike
          )
          position_info.spread_type = 'OTHER'
        }

        position_info.liability =
          max_strike_diff * contracts * call_position.contract.multiplier
        position_info.unlimited_risk = false
        position_info.protective_option = {
          strike: protective_call.contract.strike,
          expiration: protective_call.contract.lastTradeDateOrContractMonth
        }
      } else if (remaining_shares > 0) {
        // Partially covered by shares
        position_info.risk_type = 'PARTIALLY_COVERED'
        const covered_shares = remaining_shares
        const uncovered_shares = shares_needed - covered_shares
        const uncovered_contracts =
          uncovered_shares / call_position.contract.multiplier

        position_info.liability =
          call_position.contract.strike *
          uncovered_contracts *
          call_position.contract.multiplier
        position_info.covered_amount = covered_shares
        position_info.unlimited_risk = true

        // Use up all remaining shares
        remaining_shares = 0
      } else {
        // Naked call - unlimited risk
        position_info.risk_type = 'UNLIMITED'
        position_info.liability =
          call_position.contract.strike *
          contracts *
          call_position.contract.multiplier
        position_info.unlimited_risk = true
      }

      // Add to appropriate result category
      if (position_info.unlimited_risk) {
        result.unlimited_risk_positions.push(position_info)
      } else {
        result.limited_risk_positions.push(position_info)
      }

      // Add to cash liability if applicable
      if (position_info.liability > 0) {
        result.option_cash_liability += position_info.liability
      }
    })

    // Analyze put risk
    symbol_data.short_puts.forEach((put_position) => {
      const contracts = Math.abs(put_position.pos)

      // Find protective long puts with same expiration
      const protective_long_puts = symbol_data.long_puts.filter(
        (p) =>
          p.contract.lastTradeDateOrContractMonth ===
            put_position.contract.lastTradeDateOrContractMonth &&
          !used_long_puts.has(p.contract.conId)
      )

      const position_info = {
        symbol: put_position.contract.symbol,
        right: put_position.contract.right,
        strike: put_position.contract.strike,
        expiration: put_position.contract.lastTradeDateOrContractMonth,
        contracts,
        shares_held: symbol_data.total_shares,
        shares_needed: 0,
        delta: put_position.market_data?.delta || null,
        unlimited_risk: false
      }

      // Calculate put liability - base value
      const base_liability =
        put_position.contract.strike *
        contracts *
        put_position.contract.multiplier

      if (protective_long_puts.length > 0) {
        // Put spread - limited risk
        position_info.risk_type = 'SPREAD'

        // Find the best protective put (highest strike below the short put)
        const long_puts_lower_strike = protective_long_puts.filter(
          (p) => p.contract.strike < put_position.contract.strike
        )

        let protective_put
        let is_vertical_spread = false
        let is_diagonal_spread = false

        if (long_puts_lower_strike.length > 0) {
          // Sort by strike (highest first) to find best protection
          const sorted_protective_puts = [...long_puts_lower_strike].sort(
            (a, b) => b.contract.strike - a.contract.strike
          )
          protective_put = sorted_protective_puts[0]
          is_vertical_spread = true
        } else {
          // If no lower strike puts, use any long put with same expiration
          const sorted_protective_puts = [...protective_long_puts].sort(
            (a, b) => a.contract.strike - b.contract.strike
          )
          protective_put = sorted_protective_puts[0]
          is_diagonal_spread =
            protective_put.contract.strike > put_position.contract.strike
        }

        // Mark this long put as used
        used_long_puts.set(protective_put.contract.conId, true)

        // Calculate spread risk based on spread type
        let max_strike_diff

        if (is_vertical_spread) {
          // For vertical put spreads, risk is short strike - long strike
          max_strike_diff =
            put_position.contract.strike - protective_put.contract.strike
          position_info.spread_type = 'VERTICAL'
        } else if (is_diagonal_spread) {
          // For diagonal put spread where long strike > short strike
          // May still have downside risk
          max_strike_diff = put_position.contract.strike
          position_info.spread_type = 'DIAGONAL'
        } else {
          // Other spread types
          max_strike_diff = Math.max(
            0,
            put_position.contract.strike - protective_put.contract.strike
          )
          position_info.spread_type = 'OTHER'
        }

        position_info.liability =
          max_strike_diff * contracts * put_position.contract.multiplier
        position_info.protective_option = {
          strike: protective_put.contract.strike,
          expiration: protective_put.contract.lastTradeDateOrContractMonth
        }
      } else {
        // Uncovered put - limited risk but potentially large liability
        position_info.risk_type = 'UNCOVERED_PUT'
        position_info.liability = base_liability
        result.uncovered_put_liabilities.push(position_info)
        result.total_uncovered_put_liability += base_liability
      }

      // Add to limited risk positions
      result.limited_risk_positions.push(position_info)

      // Add to cash liability
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

    if (position.unlimited_risk) {
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
