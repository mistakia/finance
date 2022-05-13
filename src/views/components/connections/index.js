import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { getConnectionsByOrder, connectionActions } from '@core/connections'

import Connections from './connections'

const mapStateToProps = createSelector(
  getConnectionsByOrder,
  (connections) => ({
    connections
  })
)

const mapDispatchToProps = {
  addConnection: connectionActions.addConnection
}

export default connect(mapStateToProps, mapDispatchToProps)(Connections)
