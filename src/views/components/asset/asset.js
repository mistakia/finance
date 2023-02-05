import React from 'react'
import PropTypes from 'prop-types'
import ImmutablePropTypes from 'react-immutable-proptypes'
import BigNumber from 'bignumber.js'
import IconButton from '@mui/material/IconButton'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import Collapse from '@mui/material/Collapse'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import TableBody from '@mui/material/TableBody'
import Table from '@mui/material/Table'
import TableContainer from '@mui/material/TableContainer'

import Holding from '@components/holding'

function Holdings({ holdings, asset }) {
  const rows = []

  holdings
    .sort((a, b) => b.quantity - a.quantity)
    .forEach((holding, index) => {
      rows.push(<Holding holding={holding} key={index} asset={asset} />)
    })

  return <TableBody>{rows}</TableBody>
}

Holdings.propTypes = {
  holdings: ImmutablePropTypes.list,
  asset: ImmutablePropTypes.record
}

export default function Asset({
  asset,
  total_balance,
  asset_class_open,
  set_asset_class_open
}) {
  const [holdings_open, set_holdings_open] = React.useState(false)
  const allocation = asset.balance / total_balance

  const set_open = set_asset_class_open || set_holdings_open
  const is_open = set_asset_class_open ? asset_class_open : holdings_open
  return (
    <>
      <TableRow hover tabIndex={-1} key={asset.link}>
        <TableCell style={{ width: 66 }}>
          <IconButton size='small' onClick={() => set_open(!is_open)}>
            {is_open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
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
      <TableRow>
        <TableCell style={{ padding: 0 }} colSpan={4}>
          <Collapse in={holdings_open} timeout='auto' unmountOnExit>
            <TableContainer>
              <Table sx={{ minWidth: 750 }} size='small'>
                <Holdings holdings={asset.holdings} asset={asset} />
              </Table>
            </TableContainer>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  )
}

Asset.propTypes = {
  asset: ImmutablePropTypes.record,
  total_balance: PropTypes.number,
  asset_class_open: PropTypes.bool,
  set_asset_class_open: PropTypes.func
}
