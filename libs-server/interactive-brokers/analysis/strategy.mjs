// ============================================================================
// Constants
// ============================================================================

const OPTION_RIGHT = {
  CALL: 'C',
  PUT: 'P'
}

const STRATEGY_TYPE = {
  IRON_CONDOR: 'IRON_CONDOR',
  SHORT_STRADDLE: 'SHORT_STRADDLE',
  LONG_STRADDLE: 'LONG_STRADDLE',
  SHORT_STRANGLE: 'SHORT_STRANGLE',
  CALL_SPREAD: 'CALL_SPREAD',
  PUT_SPREAD: 'PUT_SPREAD',
  COVERED_CALL: 'COVERED_CALL',
  NAKED_CALL: 'NAKED_CALL',
  NAKED_PUT: 'NAKED_PUT',
  LONG_CALL: 'LONG_CALL',
  LONG_PUT: 'LONG_PUT'
}

const VARIATION = {
  BULL: 'BULL',
  BEAR: 'BEAR'
}

const STATUS = {
  MAX_PROFIT: 'MAX_PROFIT',
  MAX_LOSS: 'MAX_LOSS',
  BETWEEN_STRIKES: 'BETWEEN_STRIKES'
}

const OPTIONS_MULTIPLIER = 100 // Standard options contract multiplier

// ============================================================================
// Position Value Calculations
// ============================================================================

// Calculate current value and P&L for a position
const calculate_position_current_value = (position) => {
  const contracts = Math.abs(position.pos)
  const multiplier = position.contract.multiplier
  const is_long = position.pos > 0

  // Cost basis (what was paid/received)
  // Note: IB's avgCost for options already includes the multiplier (total cost per contract)
  const cost_basis = position.avgCost * contracts

  // Current market value
  // Note: TradingView prices are per-share, so we need to multiply by multiplier
  const current_price = position.market_data?.price
  const current_value = current_price
    ? current_price * contracts * multiplier
    : null

  // For short positions, we received premium (positive cost_basis means credit)
  // For long positions, we paid premium (positive cost_basis means debit)
  let unrealized_pnl = null
  if (current_value !== null) {
    if (is_long) {
      // Long: profit if current value > cost basis
      unrealized_pnl = current_value - cost_basis
    } else {
      // Short: profit if current value < cost basis (option decayed)
      unrealized_pnl = cost_basis - current_value
    }
  }

  return {
    cost_basis,
    current_price,
    current_value,
    unrealized_pnl
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

// Calculate net debit/credit for a spread
// Returns: positive = debit paid, negative = credit received
const calculate_net_debit = ({ long_position, short_position, contracts }) => {
  const long_cost = long_position.avgCost * contracts
  const short_credit = short_position.avgCost * contracts
  return long_cost - short_credit
}

// Calculate spread width in dollars
const calculate_spread_width = ({
  strike_high,
  strike_low,
  contracts,
  multiplier
}) => {
  return (strike_high - strike_low) * contracts * multiplier
}

// Get contract count from a position
const get_contract_count = (position) => Math.abs(position.pos)

// Get multiplier from a position
const get_multiplier = (position) => position.contract.multiplier

// Filter positions that haven't been used in a strategy
const get_unused_positions = (positions, used_positions) => {
  return positions.filter((p) => !used_positions.has(p))
}

// Helper to create a strategy object for specific positions
const create_strategy_for_positions = (
  symbol_data,
  expiration,
  positions_subset
) => {
  return {
    underlying: symbol_data.symbol,
    underlying_price: symbol_data.market_data?.price || null,
    expiration,
    positions: positions_subset.map((p) => {
      const current = calculate_position_current_value(p)
      return {
        symbol: p.contract.symbol,
        right: p.contract.right,
        strike: p.contract.strike,
        quantity: p.pos,
        delta: p.market_data?.delta || null,
        theta: p.market_data?.theta || null,
        gamma: p.market_data?.gamma || null,
        bid: p.market_data?.bid || null,
        ask: p.market_data?.ask || null,
        cost_basis: current.cost_basis,
        current_price: current.current_price,
        current_value: current.current_value,
        unrealized_pnl: current.unrealized_pnl
      }
    }),
    stock_position: symbol_data.total_shares,
    strategy_type: null,
    variation: null,
    max_risk: 0,
    max_profit: 0,
    breakeven_points: [],
    total_cost_basis: 0,
    total_current_value: null,
    unrealized_pnl: null,
    remaining_profit_potential: null,
    remaining_risk: null
  }
}

// Try to identify and add a strategy, marking positions as used if successful
const try_identify_strategy = ({
  strategy,
  identifier_fn,
  identifier_args,
  positions,
  used_positions,
  strategies
}) => {
  if (identifier_fn(strategy, ...identifier_args)) {
    calculate_strategy_current_state(strategy)
    strategies.push(strategy)
    positions.forEach((p) => used_positions.add(p))
    return true
  }
  return false
}

// ============================================================================
// Strategy Identification - Main Entry Point
// ============================================================================

// Identify option strategies based on position groupings
// Handles composite strategies (e.g., call spread + naked put in same expiration)
export const identify_strategies = (symbols_map) => {
  const strategies = []

  // eslint-disable-next-line no-unused-vars
  for (const [_, symbol_data] of symbols_map) {
    for (const [expiration, positions] of symbol_data.by_expiration) {
      if (positions.length === 0) continue

      const expiration_strategies = identify_strategies_for_expiration({
        symbol_data,
        expiration,
        positions
      })
      strategies.push(...expiration_strategies)
    }
  }

  return strategies
}

// ============================================================================
// Strategy Identification - Per Expiration
// ============================================================================

// Identify all strategies for a single expiration date
const identify_strategies_for_expiration = ({
  symbol_data,
  expiration,
  positions
}) => {
  const strategies = []
  const used_positions = new Set()

  // Sort positions by strike for consistent processing
  positions.sort((a, b) => a.contract.strike - b.contract.strike)

  // Categorize positions by type
  const position_groups = categorize_positions(positions)

  // Try to identify strategies in order of complexity
  // 1. Iron Condor (most complex, uses all 4 position types)
  try_identify_iron_condor({
    symbol_data,
    expiration,
    position_groups,
    used_positions,
    strategies
  })

  // 2. Straddles/Strangles
  try_identify_straddles_strangles({
    symbol_data,
    expiration,
    position_groups,
    used_positions,
    strategies
  })

  // 3. Call Spreads
  try_identify_call_spreads({
    symbol_data,
    expiration,
    position_groups,
    used_positions,
    strategies
  })

  // 4. Put Spreads
  try_identify_put_spreads({
    symbol_data,
    expiration,
    position_groups,
    used_positions,
    strategies
  })

  // 5. Covered Calls
  try_identify_covered_calls({
    symbol_data,
    expiration,
    position_groups,
    used_positions,
    strategies
  })

  // 6. Remaining positions as naked/uncovered
  identify_remaining_positions({
    symbol_data,
    expiration,
    positions,
    used_positions,
    strategies
  })

  return strategies
}

// Categorize positions by type (calls/puts, long/short)
const categorize_positions = (positions) => {
  const calls = positions.filter((p) => p.contract.right === OPTION_RIGHT.CALL)
  const puts = positions.filter((p) => p.contract.right === OPTION_RIGHT.PUT)

  return {
    calls,
    puts,
    short_calls: calls.filter((p) => p.pos < 0),
    long_calls: calls.filter((p) => p.pos > 0),
    short_puts: puts.filter((p) => p.pos < 0),
    long_puts: puts.filter((p) => p.pos > 0)
  }
}

// Try to identify iron condor strategy
const try_identify_iron_condor = ({
  symbol_data,
  expiration,
  position_groups,
  used_positions,
  strategies
}) => {
  const { short_calls, long_calls, short_puts, long_puts } = position_groups

  if (
    short_calls.length === 1 &&
    long_calls.length === 1 &&
    short_puts.length === 1 &&
    long_puts.length === 1
  ) {
    const all_positions = [
      ...short_calls,
      ...long_calls,
      ...short_puts,
      ...long_puts
    ]
    const strategy = create_strategy_for_positions(
      symbol_data,
      expiration,
      all_positions
    )

    try_identify_strategy({
      strategy,
      identifier_fn: identify_iron_condor_strategy,
      identifier_args: [short_calls, long_calls, short_puts, long_puts],
      positions: all_positions,
      used_positions,
      strategies
    })
  }
}

// Try to identify straddle/strangle strategies
const try_identify_straddles_strangles = ({
  symbol_data,
  expiration,
  position_groups,
  used_positions,
  strategies
}) => {
  const unused_short_calls = get_unused_positions(
    position_groups.short_calls,
    used_positions
  )
  const unused_short_puts = get_unused_positions(
    position_groups.short_puts,
    used_positions
  )
  const unused_long_calls = get_unused_positions(
    position_groups.long_calls,
    used_positions
  )
  const unused_long_puts = get_unused_positions(
    position_groups.long_puts,
    used_positions
  )

  if (
    unused_short_calls.length === 1 &&
    unused_short_puts.length === 1 &&
    unused_long_calls.length === 0 &&
    unused_long_puts.length === 0
  ) {
    const straddle_positions = [...unused_short_calls, ...unused_short_puts]
    const strategy = create_strategy_for_positions(
      symbol_data,
      expiration,
      straddle_positions
    )

    try_identify_strategy({
      strategy,
      identifier_fn: identify_straddle_strategy,
      identifier_args: [unused_short_calls, unused_short_puts, [], []],
      positions: straddle_positions,
      used_positions,
      strategies
    })
  }
}

// Try to identify call spread strategies
const try_identify_call_spreads = ({
  symbol_data,
  expiration,
  position_groups,
  used_positions,
  strategies
}) => {
  const unused_short_calls = get_unused_positions(
    position_groups.short_calls,
    used_positions
  )
  const unused_long_calls = get_unused_positions(
    position_groups.long_calls,
    used_positions
  )

  if (unused_short_calls.length === 1 && unused_long_calls.length === 1) {
    const spread_positions = [...unused_short_calls, ...unused_long_calls]
    const strategy = create_strategy_for_positions(
      symbol_data,
      expiration,
      spread_positions
    )

    try_identify_strategy({
      strategy,
      identifier_fn: identify_call_spread_strategy,
      identifier_args: [unused_short_calls, unused_long_calls],
      positions: spread_positions,
      used_positions,
      strategies
    })
  }
}

// Try to identify put spread strategies
const try_identify_put_spreads = ({
  symbol_data,
  expiration,
  position_groups,
  used_positions,
  strategies
}) => {
  const unused_short_puts = get_unused_positions(
    position_groups.short_puts,
    used_positions
  )
  const unused_long_puts = get_unused_positions(
    position_groups.long_puts,
    used_positions
  )

  if (unused_short_puts.length === 1 && unused_long_puts.length === 1) {
    const spread_positions = [...unused_short_puts, ...unused_long_puts]
    const strategy = create_strategy_for_positions(
      symbol_data,
      expiration,
      spread_positions
    )

    try_identify_strategy({
      strategy,
      identifier_fn: identify_put_spread_strategy,
      identifier_args: [unused_short_puts, unused_long_puts],
      positions: spread_positions,
      used_positions,
      strategies
    })
  }
}

// Try to identify covered call strategies
const try_identify_covered_calls = ({
  symbol_data,
  expiration,
  position_groups,
  used_positions,
  strategies
}) => {
  const remaining_short_calls = get_unused_positions(
    position_groups.short_calls,
    used_positions
  )

  if (remaining_short_calls.length > 0 && symbol_data.total_shares > 0) {
    for (const short_call of remaining_short_calls) {
      const strategy = create_strategy_for_positions(symbol_data, expiration, [
        short_call
      ])

      if (
        identify_covered_call_strategy(
          strategy,
          [short_call],
          symbol_data.total_shares
        )
      ) {
        calculate_strategy_current_state(strategy)
        strategies.push(strategy)
        used_positions.add(short_call)
      }
    }
  }
}

// Identify remaining positions as naked/uncovered
const identify_remaining_positions = ({
  symbol_data,
  expiration,
  positions,
  used_positions,
  strategies
}) => {
  const remaining_positions = positions.filter((p) => !used_positions.has(p))

  for (const position of remaining_positions) {
    const strategy = create_strategy_for_positions(symbol_data, expiration, [
      position
    ])

    identify_single_position_strategy(strategy, position)
    calculate_strategy_current_state(strategy)
    strategies.push(strategy)
  }
}

// Identify strategy type for a single position
const identify_single_position_strategy = (strategy, position) => {
  const contracts = get_contract_count(position)
  const multiplier = get_multiplier(position)
  const is_short = position.pos < 0
  const is_call = position.contract.right === OPTION_RIGHT.CALL

  if (is_short) {
    if (is_call) {
      strategy.strategy_type = STRATEGY_TYPE.NAKED_CALL
      strategy.max_risk = Infinity
      strategy.max_profit = position.avgCost * contracts * multiplier
    } else {
      strategy.strategy_type = STRATEGY_TYPE.NAKED_PUT
      strategy.max_risk = position.contract.strike * contracts * multiplier
      strategy.max_profit = position.avgCost * contracts * multiplier
    }
  } else {
    if (is_call) {
      strategy.strategy_type = STRATEGY_TYPE.LONG_CALL
      strategy.max_risk = position.avgCost * contracts * multiplier
      strategy.max_profit = Infinity
    } else {
      strategy.strategy_type = STRATEGY_TYPE.LONG_PUT
      strategy.max_risk = position.avgCost * contracts * multiplier
      strategy.max_profit =
        (position.contract.strike - position.avgCost) * contracts * multiplier
    }
  }
}

// Calculate current state metrics for a strategy
const calculate_strategy_current_state = (strategy) => {
  // Sum up cost basis and current values from all positions
  let total_cost_basis = 0
  let total_current_value = 0
  let has_all_prices = true

  strategy.positions.forEach((pos) => {
    // For cost basis: long positions are debits (negative), short are credits (positive)
    if (pos.quantity > 0) {
      total_cost_basis -= pos.cost_basis // Paid for long
    } else {
      total_cost_basis += pos.cost_basis // Received for short
    }

    if (pos.current_value !== null) {
      if (pos.quantity > 0) {
        total_current_value += pos.current_value // Long worth positive
      } else {
        total_current_value -= pos.current_value // Short liability
      }
    } else {
      has_all_prices = false
    }
  })

  strategy.total_cost_basis = total_cost_basis
  strategy.total_current_value = has_all_prices ? total_current_value : null

  // Unrealized P&L = current value of position - what we paid/received
  // Positive cost_basis means net credit received, negative means net debit paid
  if (has_all_prices) {
    // Current P&L = net value now + net credit/debit at entry
    strategy.unrealized_pnl = total_current_value + total_cost_basis
  }

  // Calculate remaining profit potential and risk based on current price
  if (strategy.underlying_price !== null && has_all_prices) {
    calculate_remaining_potential(strategy)
  }
}

// ============================================================================
// Strategy Current State Calculations
// ============================================================================

// Calculate remaining profit potential and risk from current price
const calculate_remaining_potential = (strategy) => {
  const price = strategy.underlying_price

  if (strategy.strategy_type === STRATEGY_TYPE.CALL_SPREAD) {
    calculate_call_spread_remaining_potential(strategy, price)
  } else if (strategy.strategy_type === STRATEGY_TYPE.PUT_SPREAD) {
    calculate_put_spread_remaining_potential(strategy, price)
  }
}

// Calculate remaining potential for call spreads
const calculate_call_spread_remaining_potential = (strategy, price) => {
  const long_strike = Math.min(
    ...strategy.positions.filter((p) => p.quantity > 0).map((p) => p.strike)
  )
  const short_strike = Math.max(
    ...strategy.positions.filter((p) => p.quantity < 0).map((p) => p.strike)
  )

  if (strategy.variation === VARIATION.BULL) {
    // Bull call spread: max profit when price >= short strike
    if (price >= short_strike) {
      strategy.remaining_profit_potential = 0
      strategy.remaining_risk = strategy.max_profit + strategy.max_risk
      strategy.status = STATUS.MAX_PROFIT
    } else if (price <= long_strike) {
      strategy.remaining_profit_potential =
        strategy.max_profit + strategy.max_risk
      strategy.remaining_risk = 0
      strategy.status = STATUS.MAX_LOSS
    } else {
      // Between strikes
      const contracts = Math.abs(strategy.positions[0].quantity)
      const current_intrinsic =
        (price - long_strike) * OPTIONS_MULTIPLIER * contracts
      strategy.remaining_profit_potential =
        strategy.max_profit - current_intrinsic + strategy.total_cost_basis
      strategy.remaining_risk = current_intrinsic - strategy.total_cost_basis
      strategy.status = STATUS.BETWEEN_STRIKES
    }
  }
}

// Calculate remaining potential for put spreads
const calculate_put_spread_remaining_potential = (strategy, price) => {
  const short_strike = Math.max(
    ...strategy.positions.filter((p) => p.quantity < 0).map((p) => p.strike)
  )
  const long_strike = Math.min(
    ...strategy.positions.filter((p) => p.quantity > 0).map((p) => p.strike)
  )

  if (strategy.variation === VARIATION.BULL) {
    // Bull put spread: max profit when price >= short strike
    if (price >= short_strike) {
      strategy.remaining_profit_potential = 0
      strategy.remaining_risk = strategy.max_profit
      strategy.status = STATUS.MAX_PROFIT
    } else if (price <= long_strike) {
      strategy.remaining_profit_potential =
        strategy.max_profit + strategy.max_risk
      strategy.remaining_risk = 0
      strategy.status = STATUS.MAX_LOSS
    } else {
      strategy.status = STATUS.BETWEEN_STRIKES
    }
  }
}

// ============================================================================
// Strategy Identification Functions
// ============================================================================

// Identify call spread strategy
const identify_call_spread_strategy = (strategy, short_calls, long_calls) => {
  if (short_calls.length !== 1 || long_calls.length !== 1) return false

  const short_call = short_calls[0]
  const long_call = long_calls[0]

  // Check if the number of contracts match
  if (get_contract_count(short_call) !== get_contract_count(long_call)) {
    return false
  }

  strategy.strategy_type = STRATEGY_TYPE.CALL_SPREAD

  const contracts = get_contract_count(short_call)
  const multiplier = get_multiplier(short_call)
  const net_debit = calculate_net_debit({
    long_position: long_call,
    short_position: short_call,
    contracts
  })

  if (long_call.contract.strike < short_call.contract.strike) {
    // Bull call spread (debit spread): buy lower strike, sell higher strike
    strategy.variation = VARIATION.BULL
    const width = calculate_spread_width({
      strike_high: short_call.contract.strike,
      strike_low: long_call.contract.strike,
      contracts,
      multiplier
    })

    strategy.max_risk = Math.max(0, net_debit)
    strategy.max_profit = width - net_debit
    strategy.breakeven_points = [
      long_call.contract.strike + net_debit / (contracts * multiplier)
    ]
  } else {
    // Bear call spread (credit spread): sell lower strike, buy higher strike
    strategy.variation = VARIATION.BEAR
    const width = calculate_spread_width({
      strike_high: long_call.contract.strike,
      strike_low: short_call.contract.strike,
      contracts,
      multiplier
    })

    const net_credit = -net_debit
    strategy.max_profit = net_credit
    strategy.max_risk = width - net_credit
    strategy.breakeven_points = [
      short_call.contract.strike + net_credit / (contracts * multiplier)
    ]
  }

  return true
}

// Identify put spread strategy
const identify_put_spread_strategy = (strategy, short_puts, long_puts) => {
  if (short_puts.length !== 1 || long_puts.length !== 1) return false

  const short_put = short_puts[0]
  const long_put = long_puts[0]

  // Check if the number of contracts match
  if (get_contract_count(short_put) !== get_contract_count(long_put)) {
    return false
  }

  strategy.strategy_type = STRATEGY_TYPE.PUT_SPREAD

  const contracts = get_contract_count(short_put)
  const multiplier = get_multiplier(short_put)
  const net_debit = calculate_net_debit({
    long_position: long_put,
    short_position: short_put,
    contracts
  })

  if (short_put.contract.strike > long_put.contract.strike) {
    // Bull put spread (credit spread): sell higher strike, buy lower strike
    strategy.variation = VARIATION.BULL
    const width = calculate_spread_width({
      strike_high: short_put.contract.strike,
      strike_low: long_put.contract.strike,
      contracts,
      multiplier
    })

    const net_credit = -net_debit
    strategy.max_profit = net_credit
    strategy.max_risk = width - net_credit
    strategy.breakeven_points = [
      short_put.contract.strike - net_credit / (contracts * multiplier)
    ]
  } else {
    // Bear put spread (debit spread): buy higher strike, sell lower strike
    strategy.variation = VARIATION.BEAR
    const width = calculate_spread_width({
      strike_high: long_put.contract.strike,
      strike_low: short_put.contract.strike,
      contracts,
      multiplier
    })

    strategy.max_risk = Math.max(0, net_debit)
    strategy.max_profit = width - net_debit
    strategy.breakeven_points = [
      long_put.contract.strike - net_debit / (contracts * multiplier)
    ]
  }

  return true
}

// Identify straddle/strangle strategies
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
    return identify_short_straddle(strategy, short_calls[0], short_puts[0])
  }

  // Long straddle: one long call and one long put at the same strike
  if (
    long_calls.length === 1 &&
    long_puts.length === 1 &&
    long_calls[0].contract.strike === long_puts[0].contract.strike
  ) {
    return identify_long_straddle(strategy, long_calls[0], long_puts[0])
  }

  // Short strangle: one short call and one short put at different strikes
  if (
    short_calls.length === 1 &&
    short_puts.length === 1 &&
    short_calls[0].contract.strike !== short_puts[0].contract.strike
  ) {
    return identify_short_strangle(strategy, short_calls[0], short_puts[0])
  }

  return false
}

// Identify short straddle
const identify_short_straddle = (strategy, call, put) => {
  strategy.strategy_type = STRATEGY_TYPE.SHORT_STRADDLE

  const contracts = Math.min(get_contract_count(call), get_contract_count(put))
  const multiplier = get_multiplier(call)
  const credit_received =
    (Math.abs(call.avgCost) + Math.abs(put.avgCost)) * contracts * multiplier

  strategy.max_profit = credit_received
  strategy.max_risk = Infinity

  const strike = call.contract.strike
  const premium_per_share = credit_received / (contracts * multiplier)
  strategy.breakeven_points = [
    strike - premium_per_share / 2,
    strike + premium_per_share / 2
  ]

  return true
}

// Identify long straddle
const identify_long_straddle = (strategy, call, put) => {
  strategy.strategy_type = STRATEGY_TYPE.LONG_STRADDLE

  const contracts = Math.min(get_contract_count(call), get_contract_count(put))
  const multiplier = get_multiplier(call)
  const cost_basis =
    (Math.abs(call.avgCost) + Math.abs(put.avgCost)) * contracts * multiplier

  strategy.max_risk = cost_basis
  strategy.max_profit = Infinity

  const strike = call.contract.strike
  const premium_per_share = cost_basis / (contracts * multiplier)
  strategy.breakeven_points = [
    strike - premium_per_share / 2,
    strike + premium_per_share / 2
  ]

  return true
}

// Identify short strangle
const identify_short_strangle = (strategy, call, put) => {
  strategy.strategy_type = STRATEGY_TYPE.SHORT_STRANGLE

  const contracts = Math.min(get_contract_count(call), get_contract_count(put))
  const multiplier = get_multiplier(call)
  const credit_received =
    (Math.abs(call.avgCost) + Math.abs(put.avgCost)) * contracts * multiplier

  strategy.max_profit = credit_received
  strategy.max_risk = Infinity

  const premium_per_share = credit_received / (contracts * multiplier)
  strategy.breakeven_points = [
    put.contract.strike - premium_per_share,
    call.contract.strike + premium_per_share
  ]

  return true
}

// Identify covered call strategy
const identify_covered_call_strategy = (strategy, short_calls, shares_held) => {
  if (short_calls.length !== 1 || shares_held <= 0) return false

  const call = short_calls[0]
  const contracts = get_contract_count(call)
  const multiplier = get_multiplier(call)
  const shares_needed = contracts * multiplier

  if (shares_held < shares_needed) return false

  strategy.strategy_type = STRATEGY_TYPE.COVERED_CALL

  // Note: IB's avgCost already includes the multiplier (total cost per contract)
  const credit_received = Math.abs(call.avgCost) * contracts

  // Max profit is limited to the strike price gain plus premium
  strategy.max_profit = call.contract.strike * shares_needed + credit_received

  // Max risk is limited to downside on the stock (assuming stock goes to zero)
  // But this is reduced by the premium received
  strategy.max_risk = call.avgCost * shares_needed - credit_received

  strategy.breakeven_points = [call.avgCost - credit_received / shares_needed]

  return true
}

// Identify iron condor strategy
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
  ) {
    return false
  }

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

  strategy.strategy_type = STRATEGY_TYPE.IRON_CONDOR

  const contracts = Math.min(
    get_contract_count(short_call),
    get_contract_count(long_call),
    get_contract_count(short_put),
    get_contract_count(long_put)
  )
  const multiplier = get_multiplier(short_call)

  const call_credit = Math.abs(short_call.avgCost) - Math.abs(long_call.avgCost)
  const put_credit = Math.abs(short_put.avgCost) - Math.abs(long_put.avgCost)
  const total_credit = (call_credit + put_credit) * contracts * multiplier

  const call_spread_width =
    long_call.contract.strike - short_call.contract.strike
  const put_spread_width = short_put.contract.strike - long_put.contract.strike
  const max_risk =
    Math.max(call_spread_width, put_spread_width) * contracts * multiplier -
    total_credit

  strategy.max_profit = total_credit
  strategy.max_risk = max_risk

  const premium_per_share = total_credit / (contracts * multiplier)
  strategy.breakeven_points = [
    short_put.contract.strike - premium_per_share,
    short_call.contract.strike + premium_per_share
  ]

  return true
}
