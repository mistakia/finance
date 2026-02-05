export const connectionActions = {
  ADD_CONNECTION: 'ADD_CONNECTION',
  SYNC_CONNECTION: 'SYNC_CONNECTION',
  DEL_CONNECTION: 'DEL_CONNECTION',

  SET_CONNECTIONS: 'SET_CONNECTIONS',

  SET_CONNECTION_SESSION: 'SET_CONNECTION_SESSION',
  SET_CONNECTION_LAST_CONNECTION: 'SET_CONNECTION_LAST_CONNECTION',

  CONNECTION_PROMPT_REQUEST: 'CONNECTION_PROMPT_REQUEST',
  CONNECTION_PROMPT_RESPONSE: 'CONNECTION_PROMPT_RESPONSE',

  syncConnection: ({ id, connection, params }) => ({
    type: connectionActions.SYNC_CONNECTION,
    payload: {
      id,
      connection,
      params
    }
  }),

  addConnection: ({ id, connection, params }) => ({
    type: connectionActions.ADD_CONNECTION,
    payload: {
      id,
      connection,
      params
    }
  }),

  delConnection: ({ id }) => ({
    type: connectionActions.DEL_CONNECTION,
    payload: {
      id
    }
  }),

  setConnections: (connections) => ({
    type: connectionActions.SET_CONNECTIONS,
    payload: {
      connections
    }
  }),

  connectionPromptResponse: (params) => ({
    type: connectionActions.CONNECTION_PROMPT_RESPONSE,
    payload: {
      params
    }
  }),

  GET_CONNECTIONS_FAILED: 'GET_CONNECTIONS_FAILED',
  GET_CONNECTIONS_PENDING: 'GET_CONNECTIONS_PENDING',
  GET_CONNECTIONS_FULFILLED: 'GET_CONNECTIONS_FULFILLED',

  getConnectionsFailed: (params, error) => ({
    type: connectionActions.GET_CONNECTIONS_FAILED,
    payload: { params, error }
  }),
  getConnectionsPending: (params) => ({
    type: connectionActions.GET_CONNECTIONS_PENDING,
    payload: { params }
  }),
  getConnectionsFulfilled: (params, data) => ({
    type: connectionActions.GET_CONNECTIONS_FULFILLED,
    payload: { params, data }
  }),

  SAVE_CONNECTION_FAILED: 'SAVE_CONNECTION_FAILED',
  SAVE_CONNECTION_PENDING: 'SAVE_CONNECTION_PENDING',
  SAVE_CONNECTION_FULFILLED: 'SAVE_CONNECTION_FULFILLED',

  saveConnectionFailed: (params, error) => ({
    type: connectionActions.SAVE_CONNECTION_FAILED,
    payload: { params, error }
  }),
  saveConnectionPending: (params) => ({
    type: connectionActions.SAVE_CONNECTION_PENDING,
    payload: { params }
  }),
  saveConnectionFulfilled: (params, data) => ({
    type: connectionActions.SAVE_CONNECTION_FULFILLED,
    payload: { params, data }
  }),

  DELETE_CONNECTION_FAILED: 'DELETE_CONNECTION_FAILED',
  DELETE_CONNECTION_PENDING: 'DELETE_CONNECTION_PENDING',
  DELETE_CONNECTION_FULFILLED: 'DELETE_CONNECTION_FULFILLED',

  deleteConnectionFailed: (params, error) => ({
    type: connectionActions.DELETE_CONNECTION_FAILED,
    payload: { params, error }
  }),
  deleteConnectionPending: (params) => ({
    type: connectionActions.DELETE_CONNECTION_PENDING,
    payload: { params }
  }),
  deleteConnectionFulfilled: (params, data) => ({
    type: connectionActions.DELETE_CONNECTION_FULFILLED,
    payload: { params, data }
  })
}

export const getConnectionsRequestActions = {
  failed: connectionActions.getConnectionsFailed,
  pending: connectionActions.getConnectionsPending,
  fulfilled: connectionActions.getConnectionsFulfilled
}

export const saveConnectionRequestActions = {
  failed: connectionActions.saveConnectionFailed,
  pending: connectionActions.saveConnectionPending,
  fulfilled: connectionActions.saveConnectionFulfilled
}

export const deleteConnectionRequestActions = {
  failed: connectionActions.deleteConnectionFailed,
  pending: connectionActions.deleteConnectionPending,
  fulfilled: connectionActions.deleteConnectionFulfilled
}
