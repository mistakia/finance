import React from 'react'
import PropTypes from 'prop-types'
import Button from '@mui/material/Button'
import Modal from '@mui/material/Modal'
import SearchIcon from '@mui/icons-material/Search'
import TextField from '@mui/material/TextField'
import IconButton from '@mui/material/IconButton'
import AddIcon from '@mui/icons-material/Add'
import Tooltip from '@mui/material/Tooltip'

import { CONNECTIONS } from '@core/connections'
import { fuzzySearch } from '@core/utils'

import './connection-modal.styl'

export default function ConnectionModal({
  connection,
  addConnection,
  on_close = () => {},
  open
}) {
  const [search_value, set_search_value] = React.useState('')
  const existing_connection_type = connection
    ? CONNECTIONS.find((c) => c.id === connection.connection)
    : null
  const [selected_connection, set_selected_connection] = React.useState(
    existing_connection_type
  )
  const [modal_open, set_modal_open] = React.useState(open || false)

  const handleClose = () => {
    set_modal_open(false)
    on_close()
  }

  const handleOpen = () => {
    set_modal_open(true)
    set_selected_connection(null)
  }

  const handleChange = (event) => {
    const { value } = event.target
    set_search_value(value)
  }

  const handleSelected = (connection) => {
    set_selected_connection(connection)
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const properties = Object.keys(event.target.elements)
    const fields = properties
      .filter((p) => p.includes('fields/'))
      .map((p) => p.split('fields/')[1])
    const params = fields.map((field) => ({
      field,
      value: event.target.elements[`fields/${field}`].value
    }))

    const field = params.find((p) => p.field === selected_connection.params_id)
    const param_id = field.value
    const id = `${selected_connection.id}/${param_id}`.toLowerCase()
    addConnection({ id, connection: selected_connection, params })
    handleClose()
  }

  const filtered = CONNECTIONS.filter((item) =>
    fuzzySearch(search_value, item.name)
  )
  const results = filtered.map((item, idx) => (
    <div
      className='result__item'
      key={idx}
      onClick={() => handleSelected(item)}>
      <div className='connection__name'>{item.name}</div>
    </div>
  ))

  const search_elem = (
    <>
      <div className='search'>
        <SearchIcon />
        <input
          className='search'
          type='text'
          placeholder='Search for Banks, Brokers, Exchanges, Wallets...'
          value={search_value}
          onChange={handleChange}
        />
      </div>
      <div className='results'>{results}</div>
    </>
  )

  const connection_elem = selected_connection && (
    <div className='connection'>
      <div className='connection__header'>
        Connect to {selected_connection.name}
      </div>
      <form onSubmit={handleSubmit}>
        <div className='connection__form'>
          {selected_connection.params.map((field, idx) => (
            <TextField
              label={field}
              multiline
              key={idx}
              name={`fields/${field}`}
              defaultValue={
                connection
                  ? connection.params.find((p) => p.field === field).value
                  : ''
              }
            />
          ))}
        </div>
        <div className='connection__footer'>
          <Button type='submit' variant='contained'>
            Save connection
          </Button>
        </div>
      </form>
    </div>
  )
  const body = selected_connection ? connection_elem : search_elem

  return (
    <>
      <Tooltip title='Add Connection'>
        <IconButton onClick={handleOpen}>
          <AddIcon />
        </IconButton>
      </Tooltip>
      <Modal
        open={modal_open}
        onClose={handleClose}
        aria-labelledby='child-modal-title'
        aria-describedby='child-modal-description'>
        <div className='connection__modal'>{body}</div>
      </Modal>
    </>
  )
}

ConnectionModal.propTypes = {
  addConnection: PropTypes.func,
  connection: PropTypes.object,
  on_close: PropTypes.func,
  open: PropTypes.bool
}
