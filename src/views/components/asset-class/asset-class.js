import React from 'react'
import PropTypes from 'prop-types'
import ImmutablePropTypes from 'react-immutable-proptypes'
import Collapse from '@mui/material/Collapse'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import TableBody from '@mui/material/TableBody'
import Table from '@mui/material/Table'
import TableContainer from '@mui/material/TableContainer'
import { connect } from 'react-redux'
import { createSelector } from 'reselect'
import {
  getAssetsByClass,
  getAssetClassSummary,
  getAssetClassesByAssetClass
} from '@core/assets'

import Asset from '@components/asset'

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
  const [open, setOpen] = React.useState(false)
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

  return (
    <>
      <Asset
        asset={summary}
        key={summary.symbol}
        setOpen={setOpen}
        open={open}
      />
      <TableRow>
        <TableCell style={{ padding: 0 }} colSpan={4}>
          <Collapse in={open} timeout='auto' unmountOnExit>
            <TableContainer>
              <Table sx={{ minWidth: 750 }} size='small'>
                <TableBody>{rows}</TableBody>
              </Table>
            </TableContainer>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  )
}

AssetClass.propTypes = {
  summary: PropTypes.object,
  assets: ImmutablePropTypes.map,
  asset_classes: ImmutablePropTypes.list,
  asset_class: PropTypes.string
}

const ConnectedAssetClass = connect(mapStateToProps)(AssetClass)

export default ConnectedAssetClass
