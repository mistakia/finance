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

import './add-connection.styl'

export default class AddConnection extends React.Component {
  state = {
    search: '',
    selected: null,
    open: false
  }

  handleClose = () => {
    this.setState({ open: false })
  }

  handleOpen = () => {
    this.setState({ open: true, selected: null })
  }

  handleChange = (event) => {
    const { value } = event.target
    this.setState({ search: value })
  }

  handleSelected = (connection) => {
    this.setState({ selected: connection })
  }

  handleSubmit = (event) => {
    event.preventDefault()
    const properties = Object.keys(event.target.elements)
    const fields = properties
      .filter((p) => p.includes('fields/'))
      .map((p) => p.split('fields/')[1])
    const params = fields.map((field) => ({
      field,
      value: event.target.elements[`fields/${field}`].value
    }))

    const connection = this.state.selected
    this.props.addConnection({ connection, params })
  }

  render() {
    const filtered = CONNECTIONS.filter((item) =>
      fuzzySearch(this.state.search, item.name)
    )
    const results = filtered.map((item, idx) => (
      <div
        className='result__item'
        key={idx}
        onClick={() => this.handleSelected(item)}>
        <div className='connection__name'>{item.name}</div>
      </div>
    ))

    const search = (
      <>
        <div className='search'>
          <SearchIcon />
          <input
            className='search'
            type='text'
            placeholder='Search for Banks, Brokers, Exchanges, Wallets...'
            value={this.state.search}
            onChange={this.handleChange}
          />
        </div>
        <div className='results'>{results}</div>
      </>
    )
    const connection = this.state.selected && (
      <div className='connection'>
        <div className='connection__header'>
          Connect to {this.state.selected.name}
        </div>
        <form onSubmit={this.handleSubmit}>
          <div className='connection__form'>
            {this.state.selected.params.map((field, idx) => (
              <TextField
                label={field}
                multiline
                key={idx}
                name={`fields/${field}`}
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
    const body = this.state.selected ? connection : search

    return (
      <>
        <Tooltip title='Add Connection'>
          <IconButton onClick={this.handleOpen}>
            <AddIcon />
          </IconButton>
        </Tooltip>
        <Modal
          open={this.state.open}
          onClose={this.handleClose}
          aria-labelledby='child-modal-title'
          aria-describedby='child-modal-description'>
          <div className='connection__modal'>{body}</div>
        </Modal>
      </>
    )
  }
}

AddConnection.propTypes = {
  addConnection: PropTypes.func
}
