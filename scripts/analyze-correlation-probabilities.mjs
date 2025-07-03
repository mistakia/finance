import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { isMain } from '#libs-shared'
import {
  get_symbol_data_availability,
  fetch_symbol_prices_for_period,
  create_price_lookup_map,
  find_trigger_events,
  analyze_target_correlation_for_triggers,
  calculate_target_statistics,
  calculate_probability_distribution,
  get_dynamically_calculated_start_year
} from '#libs-server/analyze-symbol-correlation.mjs'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('analyze-correlation-probabilities')
debug.enable('analyze-correlation-probabilities')

const analyze_correlation_probabilities = async ({
  trigger_symbol,
  target_symbol,
  trigger_percent = -30,
  trigger_days = 43,
  target_days = 43,
  start_year = null,
  analyze_same_period = false,
  show_top_occurrences = 5,
  probability_threshold_levels = null
} = {}) => {
  // Calculate start year dynamically if not provided
  const effective_start_year =
    start_year ||
    (await get_dynamically_calculated_start_year({
      trigger_symbol,
      target_symbol
    }))

  log({
    trigger_symbol,
    target_symbol,
    trigger_percent,
    trigger_days,
    target_days,
    start_year: effective_start_year,
    analyze_same_period,
    show_top_occurrences
  })

  // Check data availability
  const [trigger_data_range, target_data_range] = await Promise.all([
    get_symbol_data_availability({ symbol: trigger_symbol }),
    get_symbol_data_availability({ symbol: target_symbol })
  ])

  log('\nData availability:')
  log(
    `${trigger_symbol}: ${trigger_data_range.min_date} to ${trigger_data_range.max_date}`
  )
  log(
    `${target_symbol}: ${target_data_range.min_date} to ${target_data_range.max_date}`
  )

  const is_negative_trigger_condition = trigger_percent < 0

  // Get prices for both symbols
  const [trigger_prices, target_prices] = await Promise.all([
    fetch_symbol_prices_for_period({
      symbol: trigger_symbol,
      start_year: effective_start_year
    }),
    fetch_symbol_prices_for_period({
      symbol: target_symbol,
      start_year: effective_start_year
    })
  ])

  const target_prices_by_date_map = create_price_lookup_map(target_prices)

  // Find trigger events
  const trigger_events = find_trigger_events({
    trigger_prices,
    trigger_percent,
    trigger_days
  })

  // Analyze correlations for trigger events
  const correlation_occurrences = analyze_target_correlation_for_triggers({
    trigger_events,
    target_prices,
    target_prices_by_date_map,
    target_days,
    analyze_same_period
  })

  // Calculate and display results
  if (trigger_events.length === 0) {
    log(
      `No occurrences found where ${trigger_symbol} moved ${trigger_percent}% in ${trigger_days} days`
    )
    return
  }

  log('\n=== TRIGGER ANALYSIS ===')
  log(
    `Found ${
      trigger_events.length
    } times where ${trigger_symbol} moved ${trigger_percent}% or ${
      is_negative_trigger_condition ? 'less' : 'more'
    } in ${trigger_days} days`
  )
  log(
    `Valid paired data: ${correlation_occurrences.length} events with corresponding ${target_symbol} data`
  )

  if (correlation_occurrences.length === 0) {
    log(`No corresponding ${target_symbol} data found for trigger events`)
    return
  }

  // Calculate probability distribution
  const probability_distribution_results = calculate_probability_distribution(
    correlation_occurrences,
    probability_threshold_levels
  )

  log(`\n=== ${target_symbol} PERFORMANCE PROBABILITIES ===`)
  log(
    `When ${trigger_symbol} ${
      is_negative_trigger_condition ? 'falls' : 'rises'
    } ${Math.abs(trigger_percent)}% or more in ${trigger_days} days,`
  )
  log(
    `${target_symbol} performance in the ${
      analyze_same_period ? 'same' : 'following'
    } ${target_days} days:\n`
  )

  for (const result of probability_distribution_results) {
    log(
      `  ${target_symbol} >= ${
        result.threshold
      }%: ${result.probability_at_or_above.toFixed(1)}% probability (${
        result.occurrences_at_or_above_threshold
      }/${correlation_occurrences.length})`
    )
  }

  // Calculate statistics
  const target_statistics = calculate_target_statistics(correlation_occurrences)
  if (target_statistics) {
    log(`\n=== ${target_symbol} STATISTICS ===`)
    log(
      `Average change: ${target_statistics.average_target_change.toFixed(2)}%`
    )
    log(`Median change: ${target_statistics.median_target_change.toFixed(2)}%`)
    log(`Min change: ${target_statistics.minimum_target_change.toFixed(2)}%`)
    log(`Max change: ${target_statistics.maximum_target_change.toFixed(2)}%`)
    log(
      `Standard deviation: ${target_statistics.target_change_standard_deviation.toFixed(
        2
      )}%`
    )
  }

  // Show top gainers and losers
  if (show_top_occurrences > 0) {
    const sorted_by_target_performance = [...correlation_occurrences].sort(
      (a, b) => b.target_change_percent - a.target_change_percent
    )

    log(`\n=== TOP ${target_symbol} GAINS ===`)
    sorted_by_target_performance
      .slice(0, show_top_occurrences)
      .forEach((o, i) => {
        log(
          `${i + 1}. ${
            o.trigger_start_date
          }: ${trigger_symbol} ${o.trigger_change_percent.toFixed(
            2
          )}% → ${target_symbol} +${o.target_change_percent.toFixed(2)}%`
        )
      })

    log(`\n=== TOP ${target_symbol} LOSSES ===`)
    sorted_by_target_performance
      .slice(-show_top_occurrences)
      .reverse()
      .forEach((o, i) => {
        log(
          `${i + 1}. ${
            o.trigger_start_date
          }: ${trigger_symbol} ${o.trigger_change_percent.toFixed(
            2
          )}% → ${target_symbol} ${o.target_change_percent.toFixed(2)}%`
        )
      })
  }
}

const main = async () => {
  let error
  try {
    const trigger_symbol = argv.trigger || argv.trigger_symbol
    const target_symbol = argv.target || argv.target_symbol

    if (!trigger_symbol) {
      throw new Error('Missing --trigger or --trigger-symbol')
    }

    if (!target_symbol) {
      throw new Error('Missing --target or --target-symbol')
    }

    await analyze_correlation_probabilities({
      trigger_symbol,
      target_symbol,
      trigger_percent:
        argv.trigger_percent || argv['trigger-percent'] || argv.percent || -30,
      trigger_days:
        argv.trigger_days || argv['trigger-days'] || argv.days || 43,
      target_days:
        argv.target_days ||
        argv['target-days'] ||
        argv.analysis_days ||
        argv['analysis-days'] ||
        43,
      start_year: argv.start || argv['start-year'] || argv.start_year || null,
      analyze_same_period: argv.same_period || argv['same-period'] || false,
      show_top_occurrences: argv.top || 5
    })
  } catch (err) {
    error = err
    console.log(error)
  }

  process.exit()
}

if (isMain(import.meta.url)) {
  main()
}

export default analyze_correlation_probabilities
