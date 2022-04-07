import React from 'react'
import PropTypes from 'prop-types'
import Box from '@mui/material/Box'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableHead from '@mui/material/TableHead'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableRow from '@mui/material/TableRow'

const ASSETS = [
  {
    name: 'US Equities',
    balance: '$50,223',
    current_allocation_pct: '34%',
    target_allocation_pct: '23%'
  },
  {
    name: 'Foreign Equities',
    balance: '$50,223',
    current_allocation_pct: '34%',
    target_allocation_pct: '23%'
  },
  {
    name: 'Fixed Income',
    balance: '$50,223',
    current_allocation_pct: '34%',
    target_allocation_pct: '23%'
  },
  {
    name: 'Currencies',
    balance: '$50,223',
    current_allocation_pct: '34%',
    target_allocation_pct: '23%'
  },
  {
    name: 'Crypto Currencies',
    balance: '$50,223',
    current_allocation_pct: '34%',
    target_allocation_pct: '23%'
  },
  {
    name: 'Commodities',
    balance: '$50,223',
    current_allocation_pct: '34%',
    target_allocation_pct: '23%'
  }
]

function Asset({ asset }) {
  return (
    <TableRow hover tabIndex={-1} key={asset.name}>
      <TableCell component='th' scope='row'>
        {asset.name}
      </TableCell>
      <TableCell align='right'>{asset.balance}</TableCell>
      <TableCell align='right'>{asset.current_allocation_pct}</TableCell>
      <TableCell align='right'>{asset.target_allocation_pct}</TableCell>
    </TableRow>
  )
}

Asset.propTypes = {
  asset: PropTypes.object
}

export default class Assets extends React.Component {
  render() {
    return (
      <Box sx={{ width: '100%', paddingTop: '35px' }}>
        <TableContainer>
          <Table sx={{ minWidth: 750 }} size='small'>
            <TableHead>
              <TableRow>
                <TableCell>Asset Class</TableCell>
                <TableCell align='right'>Balance</TableCell>
                <TableCell align='right'>Allocation</TableCell>
                <TableCell align='right'>Target</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {ASSETS.map((asset, idx) => (
                <Asset asset={asset} key={idx} />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    )
  }
}
