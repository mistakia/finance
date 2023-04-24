import { connect } from 'react-redux'

import { connectionActions } from '@core/connections'

import ConnectionModal from './connection-modal'

const mapDispatchToProps = {
  addConnection: connectionActions.addConnection
}

export default connect(null, mapDispatchToProps)(ConnectionModal)
