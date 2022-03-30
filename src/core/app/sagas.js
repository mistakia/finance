/* global gtag */
import { takeLatest, fork, call, put, delay } from 'redux-saga/effects'
import FingerprintJS from '@fingerprintjs/fingerprintjs'
import { LOCATION_CHANGE, push } from 'redux-first-history'

import { localStorageAdapter } from '@core/utils'
import history from '@core/history'
import { appActions } from './actions'

const fpPromise = FingerprintJS.load()

// cookie-less / anonymous GA reporting
async function pageView() {
  if (!window.gtag) {
    return
  }

  const fp = await fpPromise
  const result = await fp.get()

  gtag('config', '', {
    page_path: history.location.pathname,
    client_storage: 'none',
    anonymize_ip: true,
    client_id: result.visitorId
  })
}

async function loadKeys() {
  const privateKey = await localStorageAdapter.getItem('privateKey')
  const publicKey = await localStorageAdapter.getItem('publicKey')
  return {
    privateKey,
    publicKey
  }
}

export function* load() {
  const { privateKey, publicKey } = yield call(loadKeys)

  yield delay(1500)

  if (privateKey && publicKey) {
    if (history.location.pathname === '/init') {
      yield put(push('/'))
    }
    yield put(appActions.loadKey({ privateKey, publicKey }))
  } else {
    yield put(push('/init'))
  }

  yield put(appActions.loaded())
}

export function* save({ payload }) {
  const { privateKey, publicKey } = payload
  localStorageAdapter.setItem('privateKey', privateKey)
  localStorageAdapter.setItem('publicKey', publicKey)

  yield put(push('/seed'))
}

export function reset() {
  window.scrollTo(0, 0)
  pageView()
}

//= ====================================
//  WATCHERS
// -------------------------------------

export function* watchInitApp() {
  yield takeLatest(appActions.APP_LOAD, load)
}

export function* watchLocationChange() {
  yield takeLatest(LOCATION_CHANGE, reset)
}

export function* watchNewKey() {
  yield takeLatest(appActions.NEW_KEY, save)
}

//= ====================================
//  ROOT
// -------------------------------------

export const appSagas = [
  fork(watchInitApp),
  fork(watchLocationChange),
  fork(watchNewKey)
]
