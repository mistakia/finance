import React from 'react'
import PropTypes from 'prop-types'
import Stack from '@mui/material/Stack'
import { DataGrid } from '@mui/x-data-grid'
import IconButton from '@mui/material/IconButton'
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import PopupState, { bindTrigger, bindMenu } from 'material-ui-popup-state'

import AddConnection from '@components/add-connection'

import './connections.styl'

export default class Connections extends React.Component {
  render() {
    const { rows } = this.props
    const columns = [
      {
        field: 'actions',
        type: 'actions',
        width: 50,
        renderCell: ({ id }) => (
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
        )
      },
      {
        field: 'type'
      },
      {
        field: 'label'
      }
    ]

    return (
      <div className='connections__container'>
        <div style={{ height: 400, width: '100%' }}>
          <DataGrid
            rows={rows}
            columns={columns}
            hideFooterPagination
            components={{
              Header: () => (
                <div className='connections__header'>Connections</div>
              ),
              Footer: () => (
                <div className='connections__footer'>
                  <AddConnection />
                </div>
              ),
              NoRowsOverlay: () => (
                <Stack
                  className='empty'
                  height='100%'
                  alignItems='center'
                  justifyContent='center'>
                  Empty
                </Stack>
              )
            }}
          />
        </div>
      </div>
    )
  }
}

Connections.propTypes = {
  rows: PropTypes.array
}
