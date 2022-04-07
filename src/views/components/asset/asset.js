import React from 'react'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import PropTypes from 'prop-types'
import BigNumber from 'bignumber.js'

export default function Asset({ asset, balance }) {
  const allocation = asset.balance / balance
  return (
    <TableRow hover tabIndex={-1} key={asset.link}>
      <TableCell component='th' scope='row'>
        {asset.symbol}
      </TableCell>
      <TableCell align='right'>
        {BigNumber(asset.balance).toFormat(2)}
      </TableCell>
      <TableCell align='right'>
        {BigNumber(allocation * 100).toFormat(2)}%
      </TableCell>
      <TableCell align='right'></TableCell>
    </TableRow>
  )
}

Asset.propTypes = {
  asset: PropTypes.object,
  balance: PropTypes.number
}
