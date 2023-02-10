import React from 'react'
import PropTypes from 'prop-types'
import { Routes, Route } from 'react-router-dom'
import LinearProgress from '@mui/material/LinearProgress'
import Box from '@mui/material/Box'
import hotkeys from 'hotkeys-js'

import Dialog from '@components/dialog'
import HomePage from '@pages/home'
import InitPage from '@pages/init'
import SeedPage from '@pages/seed'

import '@styles/normalize.css'
import '@styles/typography.styl'
import '@styles/empty.styl'
import '@styles/table.styl'

import './app.styl'

export default function App({ load, toggle_hide_balances, isLoaded }) {
  React.useEffect(() => {
    load()

    hotkeys('h', function (event, handler) {
      toggle_hide_balances()
      event.preventDefault()
    })
  }, [])

  if (!isLoaded) {
    return (
      <div className='load__container'>
        <div className='tint__icon'>TINT</div>
        <Box sx={{ width: '100px', paddingTop: '2em' }}>
          <LinearProgress color='inherit' />
        </Box>
      </div>
    )
  }

  return (
    <>
      <Routes>
        <Route path='/' element={<HomePage />} />
        <Route path='/init' element={<InitPage />} />
        <Route path='/seed' element={<SeedPage />} />
      </Routes>
      <Dialog />
    </>
  )
}

App.propTypes = {
  load: PropTypes.func,
  isLoaded: PropTypes.bool,
  toggle_hide_balances: PropTypes.func
}
