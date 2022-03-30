import { Map } from 'immutable'

import { assetsActions } from './actions'

export function assetsReducer(state = new Map(), { payload, type }) {
  switch (type) {
    case assetsActions.GET_ASSETS_FULFILLED:
      return state.withMutations((state) => {
        payload.data.forEach((item) => {
          state.set(item.link, item)
        })
      })

    default:
      return state
  }
}
