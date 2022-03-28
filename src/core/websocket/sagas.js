import { call, takeLatest, select, fork, delay, put } from 'redux-saga/effects'

import { websocketActions } from './actions'
import { getApp, appActions } from '@core/app'
import { openWebsocket, closeWebsocket, isOpen } from './service'

export function* disconnect() {
  yield call(closeWebsocket)
}

export function* connect() {
  const { publicKey } = yield select(getApp)
  yield call(openWebsocket, { publicKey })
}

export function* reconnect() {
  const { publicKey } = yield select(getApp)
  if (publicKey) {
    while (!isOpen()) {
      yield call(connect)
      yield delay(2000) // TODO - increase delay each run
    }

    yield put(websocketActions.reconnected())
  }
}

//= ====================================
//  WATCHERS
// -------------------------------------

export function* watchWebSocketClose() {
  yield takeLatest(websocketActions.WEBSOCKET_CLOSE, reconnect)
}

export function* watchSaveKey() {
  yield takeLatest(appActions.SAVE_KEY, connect)
}

export function* watchSetKey() {
  yield takeLatest(appActions.SET_KEY, connect)
}

//= ====================================
//  ROOT
// -------------------------------------

export const websocketSagas = [
  fork(watchWebSocketClose),
  fork(watchSaveKey),
  fork(watchSetKey)
]
