import { Map } from 'immutable'

import { connectionActions } from './actions'

export function connectionReducer(state = new Map(), { payload, type }) {
  switch (type) {
    case connectionActions.ADD_CONNECTION: {
      const { id, connection, params } = payload
      return state.set(id, {
        id,
        connection: connection.id,
        params
      })
    }

    case connectionActions.SET_CONNECTIONS:
      return new Map(payload.connections)

    case connectionActions.SET_CONNECTION_SESSION: {
      const { id, session } = payload
      return state.setIn([id, 'session'], session)
    }

    default:
      return state
  }
}
