import { connect } from 'react-redux'

import { connectionActions } from '@core/connections'

import PromptDialog from './prompt-dialog'

const mapDispatchToProps = {
  connectionPromptResponse: connectionActions.connectionPromptResponse
}

export default connect(null, mapDispatchToProps)(PromptDialog)
