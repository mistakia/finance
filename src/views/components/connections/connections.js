import React from 'react'
import ImmutablePropTypes from 'react-immutable-proptypes'
import PropTypes from 'prop-types'
import Box from '@mui/material/Box'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableHead from '@mui/material/TableHead'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableRow from '@mui/material/TableRow'

import Connection from '@components/connection'
import AddConnection from '@components/add-connection'

export default class Connections extends React.Component {
  render() {
    const { connections } = this.props
    const items = []
    for (const [key, value] of connections.toSeq()) {
      items.push(<Connection key={key} connection={value} />)
    }

    return (
      <Box sx={{ width: '100%', marginTop: '40px' }}>
        <TableContainer>
          <Table sx={{ minWidth: 750 }} size='small'>
            <TableHead>
              <TableRow>
                <TableCell>Connections</TableCell>
                <TableCell align='right'>Type</TableCell>
                <TableCell align='right'>Last Connection</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>{items}</TableBody>
          </Table>
        </TableContainer>
        <Box>
          <AddConnection />
        </Box>
      </Box>
    )
  }
}

Connections.propTypes = {
  connections: ImmutablePropTypes.map,
  rows: PropTypes.array
}
