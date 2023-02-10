import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { getApp } from '@core/app'

import Balance from './balance'

const mapStateToProps = createSelector(getApp, (app) => ({
  hide_balances: app.hide_balances
}))

export default connect(mapStateToProps)(Balance)
