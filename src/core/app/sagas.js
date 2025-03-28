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
  const privateKey = await localStorageAdapter.getItem('finance_private_key')
  const publicKey = await localStorageAdapter.getItem('finance_public_key')
  return {
    privateKey,
    publicKey
  }
}

export function* init_load() {
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

export function* load_from_private({ payload }) {
  const { privateKey, publicKey } = payload
  yield put(appActions.loadKey({ privateKey, publicKey }))
  localStorageAdapter.setItem('finance_private_key', privateKey)
  localStorageAdapter.setItem('finance_public_key', publicKey)
  yield put(push('/'))
}

export function* save({ payload }) {
  const { privateKey, publicKey } = payload
  localStorageAdapter.setItem('finance_private_key', privateKey)
  localStorageAdapter.setItem('finance_public_key', publicKey)

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
  yield takeLatest(appActions.APP_LOAD, init_load)
}

export function* watchLocationChange() {
  yield takeLatest(LOCATION_CHANGE, reset)
}

export function* watchNewKey() {
  yield takeLatest(appActions.NEW_KEY, save)
}

export function* watchLoadFromPrivate() {
  yield takeLatest(appActions.LOAD_FROM_PRIVATE, load_from_private)
}

//= ====================================
//  ROOT
// -------------------------------------

export const appSagas = [
  fork(watchInitApp),
  fork(watchLocationChange),
  fork(watchNewKey),
  fork(watchLoadFromPrivate)
]
