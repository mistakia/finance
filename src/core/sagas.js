import { all } from 'redux-saga/effects'

import { appSagas } from './app'
import { connectionSagas } from './connections'

export default function* rootSage() {
  yield all([...appSagas, ...connectionSagas])
}
