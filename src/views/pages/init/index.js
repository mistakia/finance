import { connect } from 'react-redux'

import { appActions } from '@core/app'

import InitPage from './init'

const mapDispatchToProps = {
  saveKey: appActions.saveKey
}

export default connect(null, mapDispatchToProps)(InitPage)
