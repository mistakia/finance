import {
  takeLatest,
  fork,
  select,
  call,
  put
} from 'redux-saga/effects'

import { appActions, getApp } from '@core/app'
import { connectionActions } from './actions'
import { getConnections } from './selectors'
import { postJob, getConnections as fetchConnections, saveConnection, deleteConnection } from '@core/api'
import { dialogActions } from '@core/dialog'
import { send } from '@core/websocket'

const params_to_credentials = (params) => {
  const credentials = {}
  for (const param of params) {
    credentials[param.field] = param.value
  }
  return credentials
}

export function* save_single({ id }) {
  const state = yield select(getConnections)
  const { publicKey } = yield select(getApp)

  if (!publicKey) {
    return
  }

  const connection_data = state.get(id)

  if (!connection_data) {
    return
  }

  yield call(saveConnection, {
    id,
    public_key: publicKey,
    connection_type: connection_data.connection,
    params: connection_data.params,
    session: connection_data.session || null
  })
}

export function* save_by_id({ payload }) {
  const { id } = payload
  yield call(save_single, { id })
}

export function* sync({ payload }) {
  const { publicKey } = yield select(getApp)
  const { id, connection, params } = payload
  const credentials = params_to_credentials(params)
  yield call(postJob, { id, publicKey, connection, credentials })
}

export function* add({ payload }) {
  const { id } = payload
  yield call(save_single, { id })
  yield call(sync, { payload })
}

export function* del({ payload }) {
  const { id } = payload
  const { publicKey } = yield select(getApp)
  yield call(deleteConnection, { id, public_key: publicKey })
}

export function* load() {
  const { publicKey } = yield select(getApp)
  if (!publicKey) {
    return
  }

  yield call(fetchConnections, { public_key: publicKey })
}

export function* handle_get_connections_fulfilled({ payload }) {
  const { data } = payload

  if (!data || !data.length) {
    return
  }

  const connections = {}
  for (const row of data) {
    connections[row.id] = {
      id: row.id,
      connection: row.connection_type,
      params: row.params,
      session: row.session,
      last_connection: row.last_connection
    }
  }

  yield put(connectionActions.setConnections(connections))
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
  yield takeLatest(connectionActions.DEL_CONNECTION, del)
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
  yield takeLatest(connectionActions.SET_CONNECTION_SESSION, save_by_id)
}

export function* watchSetConnectionLastConnection() {
  yield takeLatest(connectionActions.SET_CONNECTION_LAST_CONNECTION, save_by_id)
}

export function* watchGetConnectionsFulfilled() {
  yield takeLatest(connectionActions.GET_CONNECTIONS_FULFILLED, handle_get_connections_fulfilled)
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
  fork(watchSetConnectionLastConnection),
  fork(watchGetConnectionsFulfilled)
]
