import { all } from 'redux-saga/effects'

import { appSagas } from './app'
import { assetSagas } from './assets'
import { connectionSagas } from './connections'
import { websocketSagas } from './websocket'

export default function* rootSage() {
  yield all([...appSagas, ...assetSagas, ...connectionSagas, ...websocketSagas])
}
