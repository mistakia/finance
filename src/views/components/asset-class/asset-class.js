import React from 'react'
import PropTypes from 'prop-types'
import ImmutablePropTypes from 'react-immutable-proptypes'

import Asset from '@components/asset'

export default class AssetClass extends React.Component {
  render() {
    const { summary, assets } = this.props
    const rows = []

    rows.push(<Asset asset={summary} key='summary' />)

    assets.forEach((asset, index) => {
      rows.push(<Asset asset={asset} key={index} />)
    })

    return <>{rows}</>
  }
}

AssetClass.propTypes = {
  summary: PropTypes.object,
  assets: ImmutablePropTypes.map
}
