// Group positions by symbol/underlying
export const group_positions_by_symbol = (positions) => {
  const symbols_map = new Map()

  // First pass: Create structure and add positions
  positions.forEach((position) => {
    const symbol = position.contract.symbol

    if (!symbols_map.has(symbol)) {
      symbols_map.set(symbol, {
        symbol,
        stock_positions: [],
        option_positions: [],
        other_positions: [],
        all_positions: [],
        total_shares: 0,
        market_data: null
      })
    }

    const symbol_data = symbols_map.get(symbol)
    symbol_data.all_positions.push(position)

    // Categorize by security type
    if (position.contract.secType === 'STK') {
      symbol_data.stock_positions.push(position)
      symbol_data.total_shares += position.pos
    } else if (position.contract.secType === 'OPT') {
      symbol_data.option_positions.push(position)
    } else {
      symbol_data.other_positions.push(position)
    }
  })

  // Second pass: Further categorize options
  // eslint-disable-next-line no-unused-vars
  for (const [_, symbol_data] of symbols_map) {
    // Group options by type and direction
    symbol_data.calls = symbol_data.option_positions.filter(
      (p) => p.contract.right === 'C'
    )
    symbol_data.puts = symbol_data.option_positions.filter(
      (p) => p.contract.right === 'P'
    )
    symbol_data.short_calls = symbol_data.calls.filter((p) => p.pos < 0)
    symbol_data.long_calls = symbol_data.calls.filter((p) => p.pos > 0)
    symbol_data.short_puts = symbol_data.puts.filter((p) => p.pos < 0)
    symbol_data.long_puts = symbol_data.puts.filter((p) => p.pos > 0)

    // Group by expiration date
    symbol_data.by_expiration = group_by_expiration(
      symbol_data.option_positions
    )
  }

  return symbols_map
}

// Group options by expiration date
const group_by_expiration = (option_positions) => {
  const expirations = new Map()

  option_positions.forEach((position) => {
    const expiration = position.contract.lastTradeDateOrContractMonth
    if (!expirations.has(expiration)) {
      expirations.set(expiration, [])
    }
    expirations.get(expiration).push(position)
  })

  return expirations
}

// Enrich positions with market data
export const enrich_with_market_data = ({
  symbols_map,
  stock_market_data,
  option_market_data
}) => {
  for (const [symbol, symbol_data] of symbols_map) {
    if (stock_market_data?.has(symbol)) {
      symbol_data.market_data = stock_market_data.get(symbol)
    }

    // Attach market data to individual stock positions
    symbol_data.stock_positions.forEach((position) => {
      if (symbol_data.market_data) {
        position.market_data = { ...symbol_data.market_data }
      }
    })

    // Attach market data to individual option positions
    symbol_data.option_positions.forEach((position) => {
      if (
        position.contract.conId &&
        option_market_data?.has(position.contract.conId)
      ) {
        position.market_data = option_market_data.get(position.contract.conId)

        // If option market data doesn't have underlying price, use the stock market data
        if (!position.market_data.underlying_price && symbol_data.market_data) {
          position.market_data.underlying_price = symbol_data.market_data.price
        }
      } else if (symbol_data.market_data) {
        // If no option market data, create a placeholder with underlying price
        position.market_data = {
          price: null,
          bid: null,
          ask: null,
          impliedVol: null,
          delta: null,
          theta: null,
          gamma: null,
          underlying_price: symbol_data.market_data.price
        }
      }
    })
  }

  return symbols_map
}

// Calculate basic position metrics
export const calculate_basic_metrics = (symbols_map) => {
  let total_stock_value = 0
  let total_option_value = 0

  // eslint-disable-next-line no-unused-vars
  for (const [_, symbol_data] of symbols_map) {
    // Calculate stock value
    symbol_data.stock_value = symbol_data.stock_positions.reduce((sum, pos) => {
      const value = pos.pos * pos.avgCost
      total_stock_value += value
      return sum + value
    }, 0)

    // Calculate option value (rough estimate based on avgCost)
    // Note: IB's avgCost already includes the multiplier (total cost per contract)
    symbol_data.option_value = symbol_data.option_positions.reduce(
      (sum, pos) => {
        const value = pos.pos * pos.avgCost
        total_option_value += value
        return sum + value
      },
      0
    )

    // Calculate share coverage for calls
    symbol_data.share_coverage = {}
    if (symbol_data.total_shares > 0 && symbol_data.short_calls.length > 0) {
      let remaining_shares = symbol_data.total_shares

      // Sort short calls by strike price (lowest first)
      const sorted_short_calls = [...symbol_data.short_calls].sort(
        (a, b) => a.contract.strike - b.contract.strike
      )

      sorted_short_calls.forEach((call) => {
        const contracts = Math.abs(call.pos)
        const shares_needed = contracts * call.contract.multiplier

        if (remaining_shares >= shares_needed) {
          // Fully covered
          call.coverage = {
            shares_needed,
            shares_covered: shares_needed,
            coverage_percent: 100,
            coverage_type: 'FULL'
          }
          remaining_shares -= shares_needed
        } else if (remaining_shares > 0) {
          // Partially covered
          call.coverage = {
            shares_needed,
            shares_covered: remaining_shares,
            coverage_percent: (remaining_shares / shares_needed) * 100,
            coverage_type: 'PARTIAL'
          }
          remaining_shares = 0
        } else {
          // Not covered
          call.coverage = {
            shares_needed,
            shares_covered: 0,
            coverage_percent: 0,
            coverage_type: 'NONE'
          }
        }
      })

      symbol_data.share_coverage.remaining_shares = remaining_shares
      symbol_data.share_coverage.covered_calls = sorted_short_calls.filter(
        (call) => call.coverage.coverage_percent > 0
      ).length
      symbol_data.share_coverage.uncovered_calls = sorted_short_calls.filter(
        (call) => call.coverage.coverage_percent === 0
      ).length
    }
  }

  return {
    symbols_map,
    metrics: {
      total_stock_value,
      total_option_value
    }
  }
}

// Extract position summary
export const create_position_summary = (positions) => {
  return positions.map((position) => ({
    contract: {
      symbol: position.contract.symbol,
      secType: position.contract.secType,
      strike: position.contract.strike,
      lastTradeDateOrContractMonth:
        position.contract.lastTradeDateOrContractMonth,
      right: position.contract.right,
      multiplier: position.contract.multiplier,
      conId: position.contract.conId
    },
    pos: position.pos,
    avgCost: position.avgCost,
    market_data: position.market_data || null
  }))
}
