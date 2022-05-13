import { connect } from 'react-redux'

import { connectionActions } from '@core/connections'

import Connection from './connection'

const mapDispatchToProps = {
  syncConnection: connectionActions.syncConnection,
  delConnection: connectionActions.delConnection
}

export default connect(null, mapDispatchToProps)(Connection)
