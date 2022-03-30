import { combineReducers } from 'redux-immutable'

import { appReducer } from './app'
import { assetsReducer } from './assets'
import { connectionReducer } from './connections'
import { dialogReducer } from './dialog'

const rootReducer = (router) =>
  combineReducers({
    router,
    app: appReducer,
    assets: assetsReducer,
    connections: connectionReducer,
    dialog: dialogReducer
  })

export default rootReducer
