import { takeLatest, fork, select, call, put } from 'redux-saga/effects'

import { appActions } from '@core/app'
import { connectionActions } from './actions'
import { getConnections } from './selectors'
import { localStorageAdapter } from '@core/utils'
import { postJob } from '@core/api'

export function* save({ payload }) {
  const state = yield select(getConnections)
  const value = JSON.stringify(state.toJS())
  localStorageAdapter.setItem('connections', value)

  // encrypt connections
  // backup to tint.finance server

  // create jobs
  // get jobs
  console.log(payload)
  yield call(postJob, payload)
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

//= ====================================
//  WATCHERS
// -------------------------------------

export function* watchAddConnection() {
  yield takeLatest(connectionActions.ADD_CONNECTION, save)
}

export function* watchInitApp() {
  yield takeLatest(appActions.APP_LOAD, load)
}

//= ====================================
//  ROOT
// -------------------------------------

export const connectionSagas = [fork(watchInitApp), fork(watchAddConnection)]
