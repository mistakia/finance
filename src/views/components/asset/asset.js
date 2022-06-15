import React from 'react'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import PropTypes from 'prop-types'
import BigNumber from 'bignumber.js'
import IconButton from '@mui/material/IconButton'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'

export default function Asset({ asset, balance, open, setOpen }) {
  const allocation = asset.balance / balance
  return (
    <TableRow hover tabIndex={-1} key={asset.link}>
      <TableCell style={{ width: 66 }}>
        {Boolean(setOpen) && (
          <IconButton size='small' onClick={() => setOpen(!open)}>
            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        )}
      </TableCell>
      <TableCell component='th' scope='row'>
        {asset.symbol}
      </TableCell>
      <TableCell align='right' style={{ width: 120 }}>
        {BigNumber(asset.balance).toFormat(2)}
      </TableCell>
      <TableCell align='right' style={{ width: 120 }}>
        {BigNumber(allocation * 100).toFormat(2)}%
      </TableCell>
    </TableRow>
  )
}

Asset.propTypes = {
  asset: PropTypes.object,
  balance: PropTypes.number,
  open: PropTypes.bool,
  setOpen: PropTypes.func
}
