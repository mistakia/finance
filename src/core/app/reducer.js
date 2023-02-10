import { Record } from 'immutable'

import { appActions } from './actions'

const initialState = new Record({
  privateKey: null,
  publicKey: null,
  isLoaded: false,
  hide_balances: true
})

export function appReducer(state = initialState(), { payload, type }) {
  switch (type) {
    case appActions.LOAD_KEY:
    case appActions.NEW_KEY:
      return state.merge({ isLoaded: true, ...payload })

    case appActions.APP_LOADED:
      return state.merge({ isLoaded: true })

    case appActions.TOGGLE_HIDE_BALANCES:
      return state.merge({ hide_balances: !state.hide_balances })

    default:
      return state
  }
}
