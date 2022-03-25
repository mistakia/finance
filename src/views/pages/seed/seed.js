import React from 'react'
import PropTypes from 'prop-types'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Grid from '@mui/material/Grid'
import Container from '@mui/material/Container'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import clipboard from 'clipboardy'

import './seed.styl'

export default class SeedPage extends React.Component {
  state = {
    copied: false
  }

  copy = async () => {
    await clipboard.write(this.props.privateKey)
    this.setState({ copied: true })
  }

  render() {
    const { privateKey } = this.props
    const first = privateKey && privateKey.slice(0, 8)
    const middle = privateKey ? privateKey.slice(8, -8).match(/.{1,8}/g) : []
    const last = privateKey && privateKey.slice(-8)
    return (
      <Container className='seed__container' maxWidth='md'>
        <Grid container spacing={4}>
          <Grid item sm={12}>
            <Typography variant='h3' gutterBottom component='div'>
              Seed
            </Typography>
            <Typography variant='body1'>
              This provides access to your accounts
            </Typography>
            <Typography variant='body1' gutterBottom>
              It can not be recovered if lost
            </Typography>
          </Grid>
          <Grid container item sm={12}>
            <Grid
              container
              columns={{ xs: 4, md: 12 }}
              className='key__container'>
              <Grid item xs={2} md={3} className='key__part highlight'>
                {first}
              </Grid>
              {middle.map((t, i) => (
                <Grid item xs={2} md={3} key={i} className='key__part'>
                  {t}
                </Grid>
              ))}
              <Grid item xs={2} md={3} className='key__part highlight'>
                {last}
              </Grid>
            </Grid>
          </Grid>
          <Grid item>
            <Button
              variant={this.state.copied ? 'contained' : 'outlined'}
              startIcon={<ContentCopyIcon />}
              onClick={this.copy}
              color={this.state.copied ? 'success' : 'primary'}>
              {this.state.copied ? 'Copied' : 'Copy to clipboard'}
            </Button>
          </Grid>
        </Grid>
      </Container>
    )
  }
}

SeedPage.propTypes = {
  privateKey: PropTypes.string
}
