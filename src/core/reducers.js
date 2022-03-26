import { combineReducers } from 'redux-immutable'

import { appReducer } from './app'
import { connectionReducer } from './connections'

const rootReducer = (router) =>
  combineReducers({
    router,
    app: appReducer,
    connections: connectionReducer
  })

export default rootReducer
