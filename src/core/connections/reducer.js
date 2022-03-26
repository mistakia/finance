import { Map } from 'immutable'

import { connectionActions } from './actions'

export function connectionReducer(state = new Map(), { payload, type }) {
  switch (type) {
    case connectionActions.ADD_CONNECTION: {
      const { connection, params } = payload
      const field = params.find((p) => p.field === connection.params_id)
      const param_id = field.value
      const connection_id = `${connection.id}/${param_id}`
      return state.set(connection_id, {
        connection: connection.id,
        params
      })
    }

    case connectionActions.SET_CONNECTIONS:
      return new Map(payload.connections)

    default:
      return state
  }
}
