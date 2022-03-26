import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { getConnections, connectionActions } from '@core/connections'

import Connections from './connections'

const mapStateToProps = createSelector(getConnections, (connections) => {
  const rows = []

  for (const [key, value] of connections.toSeq()) {
    rows.push({
      id: key,
      type: value.connection,
      label: key
    })
  }

  return {
    rows
  }
})

const mapDispatchToProps = {
  addConnection: connectionActions.addConnection
}

export default connect(mapStateToProps, mapDispatchToProps)(Connections)
