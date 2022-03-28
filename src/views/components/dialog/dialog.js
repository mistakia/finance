import React from 'react'
import PropTypes from 'prop-types'
import ImmutablePropTypes from 'react-immutable-proptypes'
import Button from '@mui/material/Button'
import MuiDialog from '@mui/material/Dialog'
import MuiDialogActions from '@mui/material/DialogActions'
import MuiDialogContent from '@mui/material/DialogContent'
import MuiDialogContentText from '@mui/material/DialogContentText'
import MuiDialogTitle from '@mui/material/DialogTitle'

import PromptDialog from '@components/prompt-dialog'

export default class Dialog extends React.Component {
  handleClick = (args) => {
    this.props.info.onConfirm(args)
    this.props.cancel()
  }

  handleClose = () => {
    this.props.cancel()
  }

  render = () => {
    if (this.props.info.id) {
      const getComponent = (id) => {
        switch (id) {
          case 'CONNECTION_PROMPT_REQUEST':
            return PromptDialog
        }
      }
      const DialogComponent = getComponent(this.props.info.id)
      const { data } = this.props.info
      return (
        <DialogComponent
          onClose={this.handleClose}
          onSubmit={this.handleClick}
          {...data}
        />
      )
    }

    return (
      <MuiDialog
        open={Boolean(this.props.info.title)}
        onClose={this.handleClose}>
        <MuiDialogTitle>{this.props.info.title}</MuiDialogTitle>
        <MuiDialogContent>
          <MuiDialogContentText>
            {this.props.info.description}
          </MuiDialogContentText>
        </MuiDialogContent>
        <MuiDialogActions>
          <Button onClick={this.handleClose} text>
            Cancel
          </Button>
          <Button onClick={this.handleClick} text>
            Confirm
          </Button>
        </MuiDialogActions>
      </MuiDialog>
    )
  }
}

Dialog.propTypes = {
  info: ImmutablePropTypes.record,
  cancel: PropTypes.func
}
