import BigNumber from 'bignumber.js'
import dayjs from 'dayjs'

import { constants } from '#trading'

export default function ({
  underlying_symbol,
  expire_date,
  strike,
  option_type
}) {
  const date = dayjs(expire_date)
  const month_str = date.format('MM')
  const year_str = date.format('YY')
  const day_str = date.format('DD')
  const strike_dollar = Math.floor(strike)
  const strike_dollar_str = `${strike_dollar}`.padStart(5, '0')
  const strike_cents = BigNumber(strike)
    .minus(strike_dollar)
    .multipliedBy(100)
    .integerValue(BigNumber.ROUND_FLOOR)
  const strike_cents_str = `${strike_cents}`.padStart(2, '0')
  const type = option_type === constants.OPTION_TYPE.CALL ? 'C' : 'P'
  return `${underlying_symbol}${year_str}${month_str}${day_str}${type}${strike_dollar_str}${strike_cents_str}0`
}
