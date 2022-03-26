export const connectionActions = {
  ADD_CONNECTION: 'ADD_CONNECTION',

  SET_CONNECTIONS: 'SET_CONNECTIONS',

  addConnection: ({ connection, params }) => ({
    type: connectionActions.ADD_CONNECTION,
    payload: {
      connection,
      params
    }
  }),

  setConnections: (connections) => ({
    type: connectionActions.SET_CONNECTIONS,
    payload: {
      connections
    }
  })
}
