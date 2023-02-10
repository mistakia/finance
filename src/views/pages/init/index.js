import { connect } from 'react-redux'

import { appActions } from '@core/app'

import InitPage from './init'

const mapDispatchToProps = {
  newKey: appActions.newKey,
  load_from_private: appActions.load_from_private
}

export default connect(null, mapDispatchToProps)(InitPage)
