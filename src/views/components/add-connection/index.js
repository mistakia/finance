import { connect } from 'react-redux'

import { connectionActions } from '@core/connections'

import AddConnection from './add-connection'

const mapDispatchToProps = {
  addConnection: connectionActions.addConnection
}

export default connect(null, mapDispatchToProps)(AddConnection)
