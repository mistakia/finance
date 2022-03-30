import { connect } from 'react-redux'

import { appActions } from '@core/app'

import InitPage from './init'

const mapDispatchToProps = {
  newKey: appActions.newKey
}

export default connect(null, mapDispatchToProps)(InitPage)
