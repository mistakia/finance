import React from 'react'
import PropTypes from 'prop-types'
import ImmutablePropTypes from 'react-immutable-proptypes'
import Collapse from '@mui/material/Collapse'
import { connect } from 'react-redux'
import { createSelector } from 'reselect'
import {
  getAssetsByClass,
  getAssetClassSummary,
  getAssetClassesByAssetClass
} from '@core/assets'

import Asset from '@components/asset'

import './asset-class.styl'

const mapStateToProps = createSelector(
  getAssetClassSummary,
  getAssetsByClass,
  getAssetClassesByAssetClass,
  (summary, assets, asset_classes) => {
    return {
      summary,
      assets,
      asset_classes
    }
  }
)

function AssetClass(props) {
  const [asset_class_open, set_asset_class_open] = React.useState(false)
  const { summary, assets, asset_classes, asset_class } = props
  const rows = []

  if (asset_classes && asset_classes.size) {
    assets.forEach((asset, index) => {
      if (asset.asset_class === asset_class) {
        rows.push(<Asset asset={asset} key={index} />)
      }
    })

    asset_classes.forEach((asset_class, idx) => {
      rows.push(<ConnectedAssetClass asset_class={asset_class} key={idx} />)
    })
  } else {
    assets.forEach((asset, index) => {
      rows.push(<Asset asset={asset} key={index} />)
    })
  }

  const classname = `asset_class ${asset_class
    .replace('/', '')
    .replaceAll('/', '_')
    .replaceAll('-', '_')}`
  return (
    <>
      <div className={classname}>
        <Asset
          asset={summary}
          key={summary.symbol}
          set_asset_class_open={set_asset_class_open}
          asset_class_open={asset_class_open}
        />
        <Collapse in={asset_class_open} timeout='auto' unmountOnExit>
          {rows}
        </Collapse>
      </div>
    </>
  )
}

AssetClass.propTypes = {
  summary: ImmutablePropTypes.record,
  assets: ImmutablePropTypes.map,
  asset_classes: ImmutablePropTypes.list,
  asset_class: PropTypes.string
}

const ConnectedAssetClass = connect(mapStateToProps)(AssetClass)

export default ConnectedAssetClass
