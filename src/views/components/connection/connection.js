import React from 'react'
import * as timeago from 'timeago.js'
import PropTypes from 'prop-types'
import PopupState, { bindTrigger, bindMenu } from 'material-ui-popup-state'
import IconButton from '@mui/material/IconButton'
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'

import ConnectionModal from '@components/connection-modal'
import { CONNECTIONS } from '@core/connections'

import './connection.styl'

export default function Connection({
  connection,
  syncConnection,
  delConnection
}) {
  const [edit_open, set_edit_open] = React.useState(false)

  const handleSync = (close) => {
    const { id, params } = connection
    syncConnection({
      id,
      params,
      connection: CONNECTIONS.find((c) => c.id === connection.connection)
    })
    close()
  }

  const handleDelete = (close) => {
    const { id } = connection
    delConnection({ id })
    close()
  }

  const handle_edit = (close) => {
    close()
    set_edit_open(true)
  }

  return (
    <>
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
                  <MenuItem onClick={() => handleSync(popupState.close)}>
                    Sync
                  </MenuItem>
                  <MenuItem onClick={() => handle_edit(popupState.close)}>
                    Edit
                  </MenuItem>
                  <MenuItem onClick={() => handleDelete(popupState.close)}>
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
      {edit_open && (
        <ConnectionModal
          open={edit_open}
          on_close={() => set_edit_open(false)}
          connection={connection}
        />
      )}
    </>
  )
}

Connection.propTypes = {
  connection: PropTypes.object,
  syncConnection: PropTypes.func,
  delConnection: PropTypes.func
}
