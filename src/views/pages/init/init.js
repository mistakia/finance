import React from 'react'
import PropTypes from 'prop-types'
import Stack from '@mui/material/Stack'
import Divider from '@mui/material/Divider'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import eccrypto from 'eccrypto'

import './init.styl'

function generateKeyPair() {
  const privateKey = eccrypto.generatePrivate()
  const publicKey = eccrypto.getPublicCompressed(privateKey)
  return {
    privateKey: privateKey.toString('hex'),
    publicKey: publicKey.toString('hex')
  }
}

export default class InitPage extends React.Component {
  generateKey = () => {
    const keyPair = generateKeyPair()
    this.props.newKey(keyPair)
  }

  render() {
    return (
      <div className='init__container'>
        <Stack
          direction='column'
          spacing={2}
          divider={<Divider orientation='horizontal' flexItem />}>
          <Button variant='contained' onClick={this.generateKey}>
            Create New Account
          </Button>
          <TextField
            id='outlined-basic'
            label='Secret'
            variant='outlined'
            helperText='Paste secret to load existing account'
          />
        </Stack>
      </div>
    )
  }
}

InitPage.propTypes = {
  newKey: PropTypes.func
}
