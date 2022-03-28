import React from 'react'
import PropTypes from 'prop-types'
import Button from '@mui/material/Button'
import MuiDialog from '@mui/material/Dialog'
import MuiDialogActions from '@mui/material/DialogActions'
import MuiDialogContent from '@mui/material/DialogContent'
import MuiDialogContentText from '@mui/material/DialogContentText'
import MuiDialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'

export default class PromptDialog extends React.Component {
  handleSubmit = (event) => {
    event.preventDefault()
    const properties = Object.keys(event.target.elements)
    const fields = properties
      .filter((p) => p.includes('inputs/'))
      .map((p) => p.split('inputs/')[1])
    const params = fields.map((field) => ({
      field,
      value: event.target.elements[`inputs/${field}`].value
    }))

    this.props.connectionPromptResponse(params)
    this.props.onClose()
  }

  render = () => {
    const { inputs } = this.props

    return (
      <MuiDialog open onClose={this.props.onClose}>
        <form onSubmit={this.handleSubmit}>
          <MuiDialogTitle>Connection Prompt</MuiDialogTitle>
          <MuiDialogContent>
            {(inputs || []).map((field, idx) => (
              <TextField
                label={field}
                multiline
                key={idx}
                name={`inputs/${field}`}
              />
            ))}
            <MuiDialogContentText></MuiDialogContentText>
            <MuiDialogContentText></MuiDialogContentText>
          </MuiDialogContent>
          <MuiDialogActions>
            <Button onClick={this.props.onClose}>Cancel</Button>
            <Button type='submit'>Submit</Button>
          </MuiDialogActions>
        </form>
      </MuiDialog>
    )
  }
}

PromptDialog.propTypes = {
  onClose: PropTypes.func,
  inputs: PropTypes.array,
  connectionPromptResponse: PropTypes.func
}
