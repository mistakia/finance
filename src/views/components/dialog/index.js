import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { dialogActions, getDialogInfo } from '@core/dialog'

import Dialog from './dialog'

const mapStateToProps = createSelector(getDialogInfo, (info) => ({
  info
}))

const mapDispatchToProps = {
  cancel: dialogActions.cancel
}

export default connect(mapStateToProps, mapDispatchToProps)(Dialog)
