import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { getApp } from '@core/app'

import SeedPage from './seed'

const mapStateToProps = createSelector(getApp, (app) => ({
  privateKey: app.privateKey
}))

export default connect(mapStateToProps)(SeedPage)
