export const websocketActions = {
  WEBSOCKET_OPEN: 'WEBSOCKET_OPEN',
  WEBSOCKET_CLOSE: 'WEBSOCKET_CLOSE',

  WEBSOCKET_RECONNECTED: 'WEBSOCKET_RECONNECTED',

  reconnected: () => ({
    type: websocketActions.WEBSOCKET_RECONNECTED
  }),

  close: () => ({
    type: websocketActions.WEBSOCKET_CLOSE
  }),

  open: () => ({
    type: websocketActions.WEBSOCKET_OPEN
  })
}
