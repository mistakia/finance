import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { getAssetsByClass, getAssetClassSummary } from '@core/assets'

import AssetClass from './asset-class'

const mapStateToProps = createSelector(
  getAssetClassSummary,
  getAssetsByClass,
  (summary, assets) => {
    return {
      summary,
      assets
    }
  }
)

export default connect(mapStateToProps)(AssetClass)
