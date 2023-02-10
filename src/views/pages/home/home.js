import React from 'react'
import PropTypes from 'prop-types'
import Grid from '@mui/material/Grid'
import Container from '@mui/material/Container'
import BigNumber from 'bignumber.js'

import Assets from '@components/assets'
import Connections from '@components/connections'
import Balance from '@components/balance'

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

export default function HomePage({ balance }) {
  // placeholder data
  /* const data = {
   *   performance: [
   *     {
   *       label: '1d',
   *       value: 0.13
   *     },
   *     {
   *       label: '1w',
   *       value: 1.29
   *     },
   *     {
   *       label: '1m',
   *       value: 7.15
   *     },
   *     {
   *       label: '3m',
   *       value: -5.23
   *     },
   *     {
   *       label: '6m',
   *       value: -0.67
   *     },
   *     {
   *       label: '1y',
   *       value: 10.47
   *     }
   *   ]
   * }
   */
  return (
    <Container maxWidth='md' className='home__container'>
      <Grid container className='home__header'>
        <Grid item xs={3} className='balance__box'>
          <Balance amount={`$${BigNumber(balance).toFormat(2)}`} />
        </Grid>
        <Grid item xs={9} container spacing={2}>
          {/* {data.performance.map((item, idx) => (
              <Performance data={item} key={idx} />
              ))} */}
        </Grid>
      </Grid>
      <Assets />
      <Connections />
    </Container>
  )
}

HomePage.propTypes = {
  balance: PropTypes.number
}
