import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { getAssets } from '@core/assets'

import Assets from './assets'

const mapStateToProps = createSelector(getAssets, (assets) => {
  return {
    assets
  }
})

export default connect(mapStateToProps)(Assets)
