import React from 'react'
import PropTypes from 'prop-types'
import PopupState, { bindTrigger, bindMenu } from 'material-ui-popup-state'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import IconButton from '@mui/material/IconButton'
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'

import { CONNECTIONS } from '@core/connections'

export default class Connection extends React.Component {
  handleSync = (close) => {
    const { connection } = this.props
    const { id, params } = connection

    this.props.syncConnection({
      id,
      params,
      connection: CONNECTIONS.find((c) => c.id === connection.connection)
    })
    close()
  }

  handleDelete = (close) => {
    const { connection } = this.props
    const { id } = connection
    this.props.delConnection({ id })

    close()
  }

  render() {
    const { connection } = this.props
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
                  <MenuItem onClick={() => this.handleSync(popupState.close)}>
                    Sync
                  </MenuItem>
                  <MenuItem onClick={popupState.close}>Edit</MenuItem>
                  <MenuItem onClick={() => this.handleDelete(popupState.close)}>
                    Delete
                  </MenuItem>
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
}

Connection.propTypes = {
  connection: PropTypes.object,
  syncConnection: PropTypes.func,
  delConnection: PropTypes.func
}
