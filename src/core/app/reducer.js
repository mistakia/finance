import { Record } from 'immutable'

import { appActions } from './actions'

const initialState = new Record({
  privateKey: null,
  publicKey: null,
  isLoaded: false
})

export function appReducer(state = initialState(), { payload, type }) {
  switch (type) {
    case appActions.LOAD_KEY:
    case appActions.NEW_KEY:
      return state.merge({ isLoaded: true, ...payload })

    case appActions.APP_LOADED:
      return state.merge({ isLoaded: true })

    default:
      return state
  }
}
