import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { getAssetClasses } from '@core/assets'

import Assets from './assets'

const mapStateToProps = createSelector(getAssetClasses, (asset_classes) => {
  return {
    asset_classes
  }
})

export default connect(mapStateToProps)(Assets)
