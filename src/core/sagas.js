import { all } from 'redux-saga/effects'

import { appSagas } from './app'
import { connectionSagas } from './connections'
import { websocketSagas } from './websocket'

export default function* rootSage() {
  yield all([...appSagas, ...connectionSagas, ...websocketSagas])
}
