import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { getAssetsBalance } from '@core/assets'

import Holding from './holding'

const mapStateToProps = createSelector(getAssetsBalance, (total_balance) => ({
  total_balance
}))

export default connect(mapStateToProps)(Holding)
