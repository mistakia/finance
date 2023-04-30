export default class AnnualizedVolatilityDeviation {
  constructor(trailing_period = 14) {
    this.last_value = null
    this.period_values = []
    this.trailing_period = trailing_period
  }

  next_value(next_period) {
    if (!this.last_value) {
      this.last_value = next_period
      return null
    }

    const log_change = Math.log(next_period / this.last_value)
    this.last_value = next_period
    this.period_values.push(log_change)

    if (this.period_values.length > this.trailing_period) {
      this.period_values.shift()
    }

    const mean =
      this.period_values.reduce((acc, val) => acc + val, 0) /
      this.period_values.length
    const variance =
      this.period_values.reduce(
        (acc, val) => acc + Math.pow(val - mean, 2),
        0
      ) /
      (this.period_values.length - 1)
    const stdev = Math.sqrt(variance)
    const hv = 100 * stdev * Math.sqrt(252)

    if (isNaN(hv)) {
      return null
    }

    return hv
  }
}
