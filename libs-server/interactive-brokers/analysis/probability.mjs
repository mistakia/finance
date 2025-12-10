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
