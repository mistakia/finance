import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { getAssetsBalance } from '@core/assets'
import { getApp } from '@core/app'

import HomePage from './home'

const mapStateToProps = createSelector(
  getAssetsBalance,
  getApp,
  (balance, app) => ({
    balance,
    hide_balances: app.hide_balances
  })
)

export default connect(mapStateToProps)(HomePage)
