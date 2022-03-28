import { WebSocket } from 'ws'

import { wait } from '../common/index.mjs'
import wss from './websocket.mjs'

const prompt = ({ publicKey, inputs }) =>
  new Promise((resolve, reject) => {
    let ws
    let listener

    for (const c of wss.clients) {
      if (c.publicKey === publicKey) {
        ws = c
      }
    }

    if (!ws) {
      return reject(new Error('user websocket not connected'))
    }

    const response = new Promise((resolve, reject) => {
      listener = (msg) => {
        const message = JSON.parse(msg)
        const { payload } = message
        const values = {}
        for (const param of payload.params) {
          values[param.field] = param.value
        }
        resolve(values)
      }
      ws.on('message', listener)
    })
    const timeout = wait(300000)

    // start race between response and timeout
    Promise.race([response, timeout]).then((value) => {
      ws.removeListener('message', listener)

      if (!value) {
        return reject(new Error('timeout'))
      }
      resolve(value)
    })

    // send websocket message to user
    const event = {
      type: 'CONNECTION_PROMPT_REQUEST',
      payload: {
        inputs
      }
    }

    wss.clients.forEach((c) => {
      if (c.publicKey === publicKey) {
        if (c && c.readyState === WebSocket.OPEN) {
          c.send(JSON.stringify(event))
        }
      }
    })
  })

export default prompt
