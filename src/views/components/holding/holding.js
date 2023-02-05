import React from 'react'
import PropTypes from 'prop-types'
import ImmutablePropTypes from 'react-immutable-proptypes'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import BigNumber from 'bignumber.js'

export default function Holding({ holding, total_balance, asset }) {
  const balance = BigNumber(holding.quantity * asset.market_value_usd).toFormat(
    2
  )
  const allocation = BigNumber(
    (holding.quantity / total_balance) * 100
  ).toFormat(2)
  const paths = holding.link.split('/')
  return (
    <TableRow hover tabIndex={-1} key={holding.link}>
      <TableCell style={{ width: 66 }} />
      <TableCell component='th' scope='row'>
        {paths.slice(2).join('/')}
      </TableCell>
      <TableCell align='right' style={{ width: 120 }}>
        {balance}
      </TableCell>
      <TableCell align='right' style={{ width: 120 }}>
        {allocation}%
      </TableCell>
    </TableRow>
  )
}

Holding.propTypes = {
  holding: PropTypes.object,
  asset: ImmutablePropTypes.record,
  total_balance: PropTypes.number
}
