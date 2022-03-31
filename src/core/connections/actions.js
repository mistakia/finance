export const connectionActions = {
  ADD_CONNECTION: 'ADD_CONNECTION',

  SET_CONNECTIONS: 'SET_CONNECTIONS',

  SET_CONNECTION_SESSION: 'SET_CONNECTION_SESSION',
  SET_CONNECTION_LAST_CONNECTION: 'SET_CONNECTION_LAST_CONNECTION',

  CONNECTION_PROMPT_REQUEST: 'CONNECTION_PROMPT_REQUEST',
  CONNECTION_PROMPT_RESPONSE: 'CONNECTION_PROMPT_RESPONSE',

  addConnection: ({ id, connection, params }) => ({
    type: connectionActions.ADD_CONNECTION,
    payload: {
      id,
      connection,
      params
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
  })
}
