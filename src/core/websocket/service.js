/* global WebSocket, setInterval, clearInterval */

import queryString from 'query-string'

import { WEBSOCKET_URL } from '@core/constants'
import storeRegistry from '@core/store-registry'

import { websocketActions } from './actions'

export let ws = null
let messages = []
let interval = null

const keepaliveMessage = JSON.stringify({ type: 'KEEPALIVE' })
const keepalive = () => {
  if (ws && ws.readyState === 1) ws.send(keepaliveMessage)
}

export const openWebsocket = (params) => {
  if (ws && ws.close) ws.close()
  console.log('connecting to websocket...')
  ws = new WebSocket(`${WEBSOCKET_URL}?${queryString.stringify(params)}`)

  ws.onopen = () => {
    const store = storeRegistry.getStore()
    console.log('connected to websocket')
    store.dispatch(websocketActions.open())
    messages.forEach((msg) => ws.send(JSON.stringify(msg)))
    messages = []

    interval = setInterval(keepalive, 30000)

    ws.onclose = () => {
      const store = storeRegistry.getStore()
      console.log('disconnected from websocket')
      store.dispatch(websocketActions.close())
      clearInterval(interval)
    }
  }

  ws.onmessage = (event) => {
    const store = storeRegistry.getStore()
    const message = JSON.parse(event.data)
    console.log(`websocket message: ${message.type}`)
    store.dispatch(message)
  }
}

export const closeWebsocket = () => {
  ws.close()
  ws = null
}

export const send = (message) => {
  if (!ws || ws.readyState !== 1) messages.push(message)
  else ws.send(JSON.stringify(message))
}

export const isOpen = () => ws && ws.readyState === 1
