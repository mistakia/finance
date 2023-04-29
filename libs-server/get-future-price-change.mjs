import dayjs from 'dayjs'
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter.js'

dayjs.extend(isSameOrAfter)

const get_future_price = ({ prices, index, future_date }) => {
  for (let i = index; i < prices.length; i += 1) {
    const price = prices[i]
    if (dayjs(price.quote_date).isSameOrAfter(future_date)) {
      return price
    }
  }
}
export default function ({ prices, price, index, days }) {
  const future_date = dayjs(price.quote_date).add(days, 'day')
  const future_price = get_future_price({
    prices,
    future_date,
    index
  })

  if (!future_price) {
    return {
      c: null,
      quote_date: null,
      pct: null
    }
  }

  // calculate the change in price
  const change_in_price = future_price.c - price.c
  const change_in_price_percent = (change_in_price / price.c) * 100

  return {
    c: future_price.c,
    quote_date: future_price.quote_date,
    pct: change_in_price_percent
  }
}
