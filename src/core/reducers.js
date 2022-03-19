import { combineReducers } from 'redux-immutable'

import { appReducer } from './app'

const rootReducer = (router) =>
  combineReducers({
    router,
    app: appReducer
  })

export default rootReducer
