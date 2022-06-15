import React from 'react'
import ImmutablePropTypes from 'react-immutable-proptypes'
import Box from '@mui/material/Box'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableHead from '@mui/material/TableHead'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableRow from '@mui/material/TableRow'

import AssetClass from '@components/asset-class'

export default class Assets extends React.Component {
  render() {
    const { asset_classes } = this.props

    return (
      <Box sx={{ width: '100%', paddingTop: '35px' }}>
        <TableContainer>
          <Table sx={{ minWidth: 750 }} size='small'>
            <TableHead>
              <TableRow>
                <TableCell></TableCell>
                <TableCell>Asset Class</TableCell>
                <TableCell align='right'>Balance</TableCell>
                <TableCell align='right'>Allocation</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {asset_classes.toJS().map((asset_class, idx) => (
                <AssetClass asset_class={asset_class} key={idx} />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    )
  }
}

Assets.propTypes = {
  asset_classes: ImmutablePropTypes.list
}
