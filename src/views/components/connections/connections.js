import React from 'react'
import ImmutablePropTypes from 'react-immutable-proptypes'
import PropTypes from 'prop-types'
import IconButton from '@mui/material/IconButton'
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import PopupState, { bindTrigger, bindMenu } from 'material-ui-popup-state'
import Box from '@mui/material/Box'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableHead from '@mui/material/TableHead'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableRow from '@mui/material/TableRow'

import AddConnection from '@components/add-connection'

function Connection({ connection }) {
  return (
    <TableRow hover tabIndex={-1} key={connection.id}>
      <TableCell component='th' scope='row' sx={{ paddingLeft: '0px' }}>
        <PopupState variant='popover' popupId='connection-context-menu'>
          {(popupState) => (
            <React.Fragment>
              <IconButton
                variant='contained'
                {...bindTrigger(popupState)}
                className='connection__actions'>
                <MoreVertRoundedIcon />
              </IconButton>
              <Menu {...bindMenu(popupState)}>
                <MenuItem onClick={popupState.close}>Edit</MenuItem>
                <MenuItem onClick={popupState.close}>Delete</MenuItem>
              </Menu>
            </React.Fragment>
          )}
        </PopupState>
        {connection.id}
      </TableCell>
      <TableCell align='right'>{connection.connection}</TableCell>
      <TableCell align='right'>{connection.last_connection}</TableCell>
    </TableRow>
  )
}

Connection.propTypes = {
  connection: PropTypes.obj
}

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
