import React from 'react'
import PropTypes from 'prop-types'
import { Routes, Route } from 'react-router-dom'

import { localStorageAdapter } from '@core/utils'
import HomePage from '@pages/home'

import '@styles/normalize.css'
import '@styles/typography.styl'

export default class App extends React.Component {
  async componentDidMount() {
    const token = await localStorageAdapter.getItem('token')
    const key = await localStorageAdapter.getItem('key')
    this.props.init({ token, key })
  }

  render() {
    return (
      <Routes>
        <Route path='/' element={<HomePage />} />
      </Routes>
    )
  }
}

App.propTypes = {
  init: PropTypes.func
}
