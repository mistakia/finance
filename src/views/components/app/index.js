import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { getApp, appActions } from '@core/app'

import App from './app'

const mapStateToProps = createSelector(getApp, (app) => ({
  isLoaded: app.isLoaded
}))

const mapDispatchToProps = {
  load: appActions.load,
  toggle_hide_balances: appActions.toggle_hide_balances
}

export default connect(mapStateToProps, mapDispatchToProps)(App)
