import { WebSocket, WebSocketServer } from 'ws'

// import sockets from './sockets.mjs'

const wss = new WebSocketServer({ noServer: true })

// sockets(wss)

export const send = ({ publicKey, event }) => {
  wss.clients.forEach((c) => {
    if (c.publicKey === publicKey) {
      if (c && c.readyState === WebSocket.OPEN) {
        c.send(JSON.stringify(event))
      }
    }
  })
}

export default wss
