import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { getAssetsBalance } from '@core/assets'

import HomePage from './home'

const mapStateToProps = createSelector(getAssetsBalance, (balance) => ({
  balance
}))

export default connect(mapStateToProps)(HomePage)
