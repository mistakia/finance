import { combineReducers } from 'redux-immutable'

import { appReducer } from './app'
import { connectionReducer } from './connections'
import { dialogReducer } from './dialog'

const rootReducer = (router) =>
  combineReducers({
    router,
    app: appReducer,
    connections: connectionReducer,
    dialog: dialogReducer
  })

export default rootReducer
