import {
  takeLatest,
  takeLeading,
  fork,
  select,
  call,
  put
} from 'redux-saga/effects'
import dayjs from 'dayjs'

import { appActions, getApp } from '@core/app'
import { connectionActions } from './actions'
import { getConnections } from './selectors'
import { CONNECTIONS } from './supported-connections'
import { localStorageAdapter } from '@core/utils'
import { postJob } from '@core/api'
import { dialogActions } from '@core/dialog'
import { send, websocketActions } from '@core/websocket'

export function* save() {
  const state = yield select(getConnections)
  const value = JSON.stringify(state.toJS())
  localStorageAdapter.setItem('connections', value)

  // encrypt connections
  // backup to tint.finance server
}

export function* sync({ payload }) {
  const { publicKey } = yield select(getApp)
  const { id, connection, params } = payload
  const credentials = {}
  for (const param of params) {
    credentials[param.field] = param.value
  }
  yield call(postJob, { id, publicKey, connection, credentials })
}

export function* add({ payload }) {
  yield call(save)

  yield call(sync, { payload })
}

async function loadConnections() {
  const connections = await localStorageAdapter.getItem('connections')
  if (connections) {
    return JSON.parse(connections)
  }

  return null
}

export function* load() {
  const connections = yield call(loadConnections)
  if (connections) {
    yield put(connectionActions.setConnections(connections))
  }
}

export function* refresh() {
  const connections = yield select(getConnections)
  const { publicKey } = yield select(getApp)
  const cutoff = dayjs().subtract(1, 'day')
  for (const value of connections.valueSeq()) {
    if (
      !value.last_connection ||
      dayjs.unix(value.last_connection).isBefore(cutoff)
    ) {
      const { id, params, session } = value
      const credentials = {}
      for (const param of params) {
        credentials[param.field] = param.value
      }
      const connection = CONNECTIONS.find((c) => c.id === value.connection)
      yield call(postJob, { id, publicKey, connection, credentials, session })
    }
  }
}

export function* showPrompt({ payload }) {
  yield put(
    dialogActions.show({
      id: 'CONNECTION_PROMPT_REQUEST',
      data: payload
    })
  )
}

export function sendResponse({ type, payload }) {
  const message = { type, payload }
  send(message)
}

//= ====================================
//  WATCHERS
// -------------------------------------

export function* watchAddConnection() {
  yield takeLatest(connectionActions.ADD_CONNECTION, add)
}

export function* watchSyncConnection() {
  yield takeLatest(connectionActions.SYNC_CONNECTION, sync)
}

export function* watchDelConnection() {
  yield takeLatest(connectionActions.DEL_CONNECTION, save)
}

export function* watchInitApp() {
  yield takeLatest(appActions.APP_LOAD, load)
}

export function* watchConnectionPromptRequest() {
  yield takeLatest(connectionActions.CONNECTION_PROMPT_REQUEST, showPrompt)
}

export function* watchConnectionPromptResponse() {
  yield takeLatest(connectionActions.CONNECTION_PROMPT_RESPONSE, sendResponse)
}

export function* watchSetConnectionSession() {
  yield takeLatest(connectionActions.SET_CONNECTION_SESSION, save)
}

export function* watchWebsocketOpen() {
  yield takeLeading(websocketActions.WEBSOCKET_OPEN, refresh)
}

export function* watchSetConnectionLastConnection() {
  yield takeLatest(connectionActions.SET_CONNECTION_LAST_CONNECTION, save)
}

//= ====================================
//  ROOT
// -------------------------------------

export const connectionSagas = [
  fork(watchInitApp),
  fork(watchAddConnection),
  fork(watchSyncConnection),
  fork(watchDelConnection),
  fork(watchConnectionPromptRequest),
  fork(watchConnectionPromptResponse),
  fork(watchSetConnectionSession),
  // fork(watchWebsocketOpen),
  fork(watchSetConnectionLastConnection)
]
