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

function getKeyPairFromPrivateKey(privateKey) {
  const private_key_buffer = Buffer.from(privateKey, 'hex')
  const publicKey = eccrypto.getPublicCompressed(private_key_buffer)
  return {
    privateKey,
    publicKey: publicKey.toString('hex')
  }
}

export default function InitPage({ newKey, load_from_private }) {
  const generateKey = () => {
    const keyPair = generateKeyPair()
    newKey(keyPair)
  }

  const handleChange = (object) => {
    const keyPair = getKeyPairFromPrivateKey(object.target.value)
    load_from_private(keyPair)
  }

  return (
    <div className='init__container'>
      <Stack
        direction='column'
        spacing={2}
        divider={<Divider orientation='horizontal' flexItem />}>
        <Button variant='contained' onClick={generateKey}>
          Create New Account
        </Button>
        <TextField
          id='outlined-basic'
          label='Secret'
          variant='outlined'
          helperText='Paste secret to load existing account'
          onChange={handleChange}
        />
      </Stack>
    </div>
  )
}

InitPage.propTypes = {
  newKey: PropTypes.func,
  load_from_private: PropTypes.func
}
