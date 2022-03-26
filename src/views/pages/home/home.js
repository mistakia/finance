import React from 'react'
import PropTypes from 'prop-types'
import Grid from '@mui/material/Grid'
import Divider from '@mui/material/Divider'
import Container from '@mui/material/Container'

import Connections from '@components/connections'

import './home.styl'

function Performance({ data }) {
  const value = data.value
  const isNegative = value < 0
  const classNames = ['performance__box']
  if (isNegative) {
    classNames.push('negative')
  }

  const getColor = () => {
    const opacity = Math.min(value / 100, 0.6)
    return `rgba(0,213,75,${opacity})`
  }

  const color = getColor()

  return (
    <Grid item xs={2}>
      <div className={classNames.join(' ')} style={{ backgroundColor: color }}>
        <div className='performance__label'>{data.label}</div>
        <div className='performance__value'>
          {!isNegative && '+'}
          {value}
          {'%'}
        </div>
      </div>
    </Grid>
  )
}

Performance.propTypes = {
  data: PropTypes.object
}

export default class HomePage extends React.Component {
  render() {
    // placeholder data
    const data = {
      balance: {
        value: 2.555,
        label: 'M'
      },
      performance: [
        {
          label: '1d',
          value: 0.13
        },
        {
          label: '1w',
          value: 1.29
        },
        {
          label: '1m',
          value: 7.15
        },
        {
          label: '3m',
          value: -5.23
        },
        {
          label: '6m',
          value: -0.67
        },
        {
          label: '1y',
          value: 10.47
        }
      ]
    }

    return (
      <Container maxWidth='md' className='home__container'>
        <Grid container className='home__header'>
          <Grid item xs={3} className='balance__box'>
            {`$${data.balance.value} ${data.balance.label}`}
          </Grid>
          <Grid item xs={9} container spacing={2}>
            {data.performance.map((item, idx) => (
              <Performance data={item} key={idx} />
            ))}
          </Grid>
        </Grid>
        <div className='assets__container'>
          <Divider textAlign='left'>Assets</Divider>
          <div className='assets__table empty'></div>
        </div>
        <Connections />
      </Container>
    )
  }
}
