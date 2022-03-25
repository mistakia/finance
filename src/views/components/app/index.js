import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { getApp, appActions } from '@core/app'

import App from './app'

const mapStateToProps = createSelector(getApp, (app) => ({
  isLoaded: app.isLoaded
}))

const mapDispatchToProps = {
  load: appActions.load
}

export default connect(mapStateToProps, mapDispatchToProps)(App)
