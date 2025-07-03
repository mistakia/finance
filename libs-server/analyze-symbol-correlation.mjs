import debug from 'debug'
import dayjs from 'dayjs'

import db from '#db'
import { get_future_price_change } from '#libs-server'

const log = debug('analyze-symbol-correlation')

export const get_symbol_data_availability = async ({ symbol }) => {
  const range = await db('end_of_day_equity_quotes')
    .where({ symbol })
    .min('quote_date as min_date')
    .max('quote_date as max_date')
    .first()

  return range
}

export const fetch_symbol_prices_for_period = async ({
  symbol,
  start_year
}) => {
  const prices = await db('end_of_day_equity_quotes')
    .where({ symbol })
    .andWhere('quote_date', '>=', `${start_year}-01-01`)
    .orderBy('quote_date', 'asc')

  return prices
}

export const create_price_lookup_map = (prices) => {
  const price_map = new Map()
  prices.forEach((price) => {
    price_map.set(price.quote_date, price)
  })
  return price_map
}

export const find_trigger_events = ({
  trigger_prices,
  trigger_percent,
  trigger_days
}) => {
  const is_negative_trigger_condition = trigger_percent < 0
  const trigger_events = []

  let trigger_price_index = 0

  for (const trigger_price of trigger_prices) {
    const trigger_price_change = get_future_price_change({
      prices: trigger_prices,
      price: trigger_price,
      days: trigger_days,
      index: trigger_price_index
    })

    if (!trigger_price_change.pct) {
      trigger_price_index += 1
      continue
    }

    const trigger_condition_met = is_negative_trigger_condition
      ? trigger_price_change.pct <= trigger_percent
      : trigger_price_change.pct >= trigger_percent

    if (trigger_condition_met) {
      trigger_events.push({
        start_date: trigger_price.quote_date,
        end_date: trigger_price_change.quote_date,
        change_percent: trigger_price_change.pct,
        start_price: trigger_price.close_price,
        end_price: trigger_price_change.close_price
      })
    }

    trigger_price_index += 1
  }

  return trigger_events
}

export const find_target_analysis_start = ({
  trigger_event,
  target_prices_by_date_map,
  analyze_same_period
}) => {
  let target_analysis_start_date
  let target_analysis_start_price

  if (analyze_same_period) {
    target_analysis_start_date = trigger_event.start_date
    target_analysis_start_price = target_prices_by_date_map.get(
      trigger_event.start_date
    )

    if (!target_analysis_start_price) {
      // Find closest available date
      for (const [date, price] of target_prices_by_date_map) {
        if (date >= trigger_event.start_date) {
          target_analysis_start_price = price
          target_analysis_start_date = date
          break
        }
      }
    }
  } else {
    // Analyze target after trigger period ends
    const target_analysis_candidates = Array.from(
      target_prices_by_date_map.entries()
    )
    for (const [date, price] of target_analysis_candidates) {
      if (dayjs(date).isSameOrAfter(trigger_event.end_date)) {
        target_analysis_start_date = date
        target_analysis_start_price = price
        break
      }
    }
  }

  return { target_analysis_start_date, target_analysis_start_price }
}

export const analyze_target_correlation_for_triggers = ({
  trigger_events,
  target_prices,
  target_prices_by_date_map,
  target_days,
  analyze_same_period
}) => {
  const correlation_occurrences = []

  for (const trigger_event of trigger_events) {
    const { target_analysis_start_date, target_analysis_start_price } =
      find_target_analysis_start({
        trigger_event,
        target_prices_by_date_map,
        analyze_same_period
      })

    if (target_analysis_start_price) {
      const target_analysis_index = target_prices.findIndex(
        (p) => p.quote_date === target_analysis_start_price.quote_date
      )

      const target_price_change = get_future_price_change({
        prices: target_prices,
        price: target_analysis_start_price,
        days: target_days,
        index: target_analysis_index
      })

      if (target_price_change.pct !== null) {
        correlation_occurrences.push({
          trigger_start_date: trigger_event.start_date,
          trigger_end_date: trigger_event.end_date,
          trigger_change_percent: trigger_event.change_percent,
          trigger_start_price: trigger_event.start_price,
          trigger_end_price: trigger_event.end_price,
          target_start_date: target_analysis_start_date,
          target_end_date: target_price_change.quote_date,
          target_change_percent: target_price_change.pct,
          target_start_price: target_analysis_start_price.close_price,
          target_end_price: target_price_change.close_price
        })
      }
    }
  }

  return correlation_occurrences
}

export const calculate_target_statistics = (correlation_occurrences) => {
  if (correlation_occurrences.length === 0) {
    return null
  }

  const target_price_changes = correlation_occurrences.map(
    (o) => o.target_change_percent
  )
  const average_target_change =
    target_price_changes.reduce((a, b) => a + b, 0) /
    target_price_changes.length
  const sorted_target_changes = [...target_price_changes].sort((a, b) => a - b)
  const median_target_change =
    sorted_target_changes[Math.floor(sorted_target_changes.length / 2)]
  const minimum_target_change = Math.min(...target_price_changes)
  const maximum_target_change = Math.max(...target_price_changes)
  const target_change_variance =
    target_price_changes.reduce(
      (a, b) => a + Math.pow(b - average_target_change, 2),
      0
    ) / target_price_changes.length
  const target_change_standard_deviation = Math.sqrt(target_change_variance)

  return {
    average_target_change,
    median_target_change,
    minimum_target_change,
    maximum_target_change,
    target_change_standard_deviation
  }
}

export const calculate_probability_distribution = (
  correlation_occurrences,
  threshold_levels = null
) => {
  if (!threshold_levels) {
    threshold_levels = [
      -50, -40, -30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30, 40, 50,
      75, 100
    ]
  }

  const probability_distribution = []

  for (const threshold of threshold_levels) {
    const occurrences_at_or_above_threshold = correlation_occurrences.filter(
      (o) => o.target_change_percent >= threshold
    ).length
    const occurrences_at_or_below_threshold = correlation_occurrences.filter(
      (o) => o.target_change_percent <= threshold
    ).length
    const probability_at_or_above =
      (occurrences_at_or_above_threshold / correlation_occurrences.length) * 100
    const probability_at_or_below =
      (occurrences_at_or_below_threshold / correlation_occurrences.length) * 100

    probability_distribution.push({
      threshold,
      occurrences_at_or_above_threshold,
      probability_at_or_above,
      occurrences_at_or_below_threshold,
      probability_at_or_below
    })
  }

  return probability_distribution
}

export const get_dynamically_calculated_start_year = async ({
  trigger_symbol,
  target_symbol
}) => {
  const [trigger_range, target_range] = await Promise.all([
    get_symbol_data_availability({ symbol: trigger_symbol }),
    get_symbol_data_availability({ symbol: target_symbol })
  ])

  const trigger_start_year = new Date(trigger_range.min_date).getFullYear()
  const target_start_year = new Date(target_range.min_date).getFullYear()

  // Use the later of the two start years to ensure both symbols have data
  const calculated_start_year = Math.max(trigger_start_year, target_start_year)

  log(
    `Dynamic start year calculation: trigger=${trigger_start_year}, target=${target_start_year}, using=${calculated_start_year}`
  )

  return calculated_start_year
}
