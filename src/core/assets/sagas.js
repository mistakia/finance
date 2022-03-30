import { takeLatest, fork, select, call } from 'redux-saga/effects'

import { appActions, getApp } from '@core/app'
import { getAssets } from '@core/api'

export function* load() {
  const { publicKey } = yield select(getApp)
  yield call(getAssets, { publicKey })
}

//= ====================================
//  WATCHERS
// -------------------------------------

export function* watchLoadKey() {
  yield takeLatest(appActions.LOAD_KEY, load)
}

//= ====================================
//  ROOT
// -------------------------------------

export const assetSagas = [fork(watchLoadKey)]
