import React from 'react'
import * as timeago from 'timeago.js'
import PropTypes from 'prop-types'
import PopupState, { bindTrigger, bindMenu } from 'material-ui-popup-state'
import IconButton from '@mui/material/IconButton'
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'

import { CONNECTIONS } from '@core/connections'

import './connection.styl'

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
      <div className='row' key={connection.id}>
        <div className='cell connection_menu'>
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
        </div>
        <div className='cell'>{connection.id}</div>
        <div className='cell connection_type'>{connection.connection}</div>
        <div className='cell connection_time'>
          {timeago.format(connection.last_connection * 1000)}
        </div>
      </div>
    )
  }
}

Connection.propTypes = {
  connection: PropTypes.object,
  syncConnection: PropTypes.func,
  delConnection: PropTypes.func
}
