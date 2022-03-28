import { Record } from 'immutable'

import { dialogActions } from './actions'

const DialogState = new Record({
  id: null,
  title: null,
  data: null,
  description: null,
  component: null,
  onConfirm: null
})

export function dialogReducer(state = new DialogState(), { payload, type }) {
  switch (type) {
    case dialogActions.SHOW_DIALOG:
      return state.merge(payload)

    case dialogActions.CANCEL_DIALOG:
      return DialogState()

    default:
      return state
  }
}
