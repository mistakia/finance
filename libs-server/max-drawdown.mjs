export default class MaxDrawdown {
  constructor(period = 14) {
    this.period_values = []
    this.trailing_period = period
  }

  nextValue(next_period) {
    // Add the next value to the period_values array
    this.period_values.push(next_period)

    // If the period_values array is longer than the trailing_period, remove the oldest value
    if (this.period_values.length > this.trailing_period) {
      this.period_values.shift()
    }

    // Calculate the maximum drawdown
    let max_value = -Infinity
    let max_drawdown = 0
    for (let i = 0; i < this.period_values.length; i++) {
      if (this.period_values[i] > max_value) {
        max_value = this.period_values[i]
      }
      const drawdown = (max_value - this.period_values[i]) / max_value
      if (drawdown > max_drawdown) {
        max_drawdown = drawdown
      }
    }

    return max_drawdown
  }
}
