import React from 'react'
import ImmutablePropTypes from 'react-immutable-proptypes'
import Box from '@mui/material/Box'

import AssetClass from '@components/asset-class'

import './assets.styl'

export default class Assets extends React.Component {
  render() {
    const { asset_classes } = this.props

    const items = []
    asset_classes.forEach((asset_class, idx) =>
      items.push(<AssetClass asset_class={asset_class} key={idx} />)
    )

    return (
      <Box sx={{ width: '100%', paddingTop: '35px' }}>
        <div className='row head'>
          <div className='cell asset_expand'></div>
          <div className='cell'>Asset Class</div>
          <div className='cell asset_balance'>Balance</div>
          <div className='cell asset_allocation'>Allocation</div>
        </div>
        {items}
      </Box>
    )
  }
}

Assets.propTypes = {
  asset_classes: ImmutablePropTypes.list
}
