import React from 'react'
import PropTypes from 'prop-types'
import ImmutablePropTypes from 'react-immutable-proptypes'
import BigNumber from 'bignumber.js'

import Balance from '@components/balance'

export default function Holding({ holding, total_balance, asset }) {
  const balance = BigNumber(holding.quantity * asset.market_value_usd).toFormat(
    2
  )
  const allocation = BigNumber(
    (holding.quantity / total_balance) * 100
  ).toFormat(2)
  const paths = holding.link.split('/')
  return (
    <div className='row' key={holding.link}>
      <div className='cell asset_expand' />
      <div className='cell'>{paths.slice(2).join('/')}</div>
      <div className='cell asset_quantity metric'>
        <Balance amount={BigNumber(holding.quantity).toFormat(2)} />
      </div>
      <div className='cell asset_balance metric'>
        <Balance amount={balance} />
      </div>
      <div className='cell asset_allocation metric'>{allocation}%</div>
    </div>
  )
}

Holding.propTypes = {
  holding: PropTypes.object,
  asset: ImmutablePropTypes.record,
  total_balance: PropTypes.number
}
