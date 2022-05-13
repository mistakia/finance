import { Map } from 'immutable'
import dayjs from 'dayjs'

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

    case connectionActions.DEL_CONNECTION: {
      const { id } = payload
      return state.delete(id)
    }

    case connectionActions.SET_CONNECTIONS:
      return new Map(payload.connections)

    case connectionActions.SET_CONNECTION_SESSION: {
      const { id, session } = payload
      return state.setIn([id, 'session'], session)
    }

    case connectionActions.SET_CONNECTION_LAST_CONNECTION: {
      const now = dayjs().unix()
      const { id } = payload
      return state.setIn([id, 'last_connection'], now)
    }

    default:
      return state
  }
}
