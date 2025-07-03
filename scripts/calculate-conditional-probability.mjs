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
  get_dynamically_calculated_start_year
} from '#libs-server/analyze-symbol-correlation.mjs'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('calculate-conditional-probability')
debug.enable('calculate-conditional-probability')

const calculate_conditional_probability = async ({
  trigger_symbol,
  target_symbol,
  trigger_percent = -30,
  trigger_days = 43,
  target_percent = 10,
  target_days = 43,
  start_year = null,
  show_dates = false,
  analyze_same_period = false
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
    target_percent,
    target_days,
    start_year: effective_start_year,
    show_dates,
    analyze_same_period
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
  const is_negative_target_condition = target_percent < 0
  let target_condition_hit_count = 0
  let missing_target_data_count = 0

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

  // Calculate target condition hits
  for (const occurrence of correlation_occurrences) {
    const target_condition_met = is_negative_target_condition
      ? occurrence.target_change_percent <= target_percent
      : occurrence.target_change_percent >= target_percent

    if (target_condition_met) {
      target_condition_hit_count += 1
    }
  }

  missing_target_data_count =
    trigger_events.length - correlation_occurrences.length

  // Calculate and display results
  if (trigger_events.length === 0) {
    log(
      `No occurrences found where ${trigger_symbol} moved ${trigger_percent}% in ${trigger_days} days`
    )
    return
  }

  const conditional_probability =
    correlation_occurrences.length > 0
      ? (target_condition_hit_count / correlation_occurrences.length) * 100
      : 0

  log('\n=== RESULTS ===')
  log(
    `Trigger events: ${
      trigger_events.length
    } times ${trigger_symbol} moved ${trigger_percent}% or ${
      is_negative_trigger_condition ? 'less' : 'more'
    } in ${trigger_days} days`
  )
  log(
    `Valid target data: ${correlation_occurrences.length} events with corresponding ${target_symbol} data`
  )
  if (missing_target_data_count > 0) {
    log(`No target data found: ${missing_target_data_count} events`)
  }

  if (correlation_occurrences.length === 0) {
    log(
      `\nNo corresponding ${target_symbol} data found for the trigger events.`
    )
    log(
      `This might be because ${target_symbol} doesn't have data for the same time periods as ${trigger_symbol}.`
    )
    return
  }

  log(
    `Target hits: ${target_condition_hit_count} times ${target_symbol} moved ${target_percent}% or ${
      is_negative_target_condition ? 'less' : 'more'
    } in ${target_days} days`
  )
  log(`\nConditional Probability: ${conditional_probability.toFixed(2)}%`)
  log(
    `(When ${trigger_symbol} falls ${Math.abs(
      trigger_percent
    )}% in ${trigger_days} days, ${target_symbol} ${
      is_negative_target_condition ? 'falls' : 'rises'
    } ${Math.abs(target_percent)}% in the ${
      analyze_same_period ? 'same' : 'following'
    } ${target_days} days ${conditional_probability.toFixed(2)}% of the time)`
  )

  // Additional statistics
  const target_statistics = calculate_target_statistics(correlation_occurrences)
  if (target_statistics) {
    log(`\n${target_symbol} statistics during analysis period:`)
    log(
      `  Average change: ${target_statistics.average_target_change.toFixed(2)}%`
    )
    log(
      `  Median change: ${target_statistics.median_target_change.toFixed(2)}%`
    )
    log(`  Min change: ${target_statistics.minimum_target_change.toFixed(2)}%`)
    log(`  Max change: ${target_statistics.maximum_target_change.toFixed(2)}%`)
  }

  if (show_dates) {
    log('\n=== DETAILED OCCURRENCES ===')

    // Add target_hit property for compatibility
    const occurrences_with_hit_flag = correlation_occurrences.map((o) => ({
      ...o,
      target_hit: is_negative_target_condition
        ? o.target_change_percent <= target_percent
        : o.target_change_percent >= target_percent,
      trigger_date: o.trigger_start_date,
      trigger_change_pct: o.trigger_change_percent,
      target_change_pct: o.target_change_percent
    }))

    const target_condition_hits = occurrences_with_hit_flag
      .filter((o) => o.target_hit)
      .sort((a, b) => b.target_change_pct - a.target_change_pct)
    log(`\nTarget hits (${target_condition_hits.length}):`)
    target_condition_hits.slice(0, 10).forEach((o) => {
      log(
        `  ${o.trigger_date}: ${trigger_symbol} ${o.trigger_change_pct.toFixed(
          2
        )}% → ${target_symbol} ${o.target_change_pct.toFixed(2)}%`
      )
    })

    const target_condition_misses = occurrences_with_hit_flag
      .filter((o) => !o.target_hit)
      .sort((a, b) => b.target_change_pct - a.target_change_pct)
    log(`\nTarget misses (${target_condition_misses.length}):`)
    target_condition_misses.slice(0, 5).forEach((o) => {
      log(
        `  ${o.trigger_date}: ${trigger_symbol} ${o.trigger_change_pct.toFixed(
          2
        )}% → ${target_symbol} ${o.target_change_pct.toFixed(2)}%`
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

    await calculate_conditional_probability({
      trigger_symbol,
      target_symbol,
      trigger_percent: argv.trigger_percent || argv['trigger-percent'] || -30,
      trigger_days: argv.trigger_days || argv['trigger-days'] || 43,
      target_percent: argv.target_percent || argv['target-percent'] || 10,
      target_days: argv.target_days || argv['target-days'] || 43,
      start_year: argv.start || argv.start_year || argv['start-year'] || null,
      show_dates: argv.show_dates || argv['show-dates'] || argv.dates || false,
      analyze_same_period: argv.same_period || argv['same-period'] || false
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

export default calculate_conditional_probability
