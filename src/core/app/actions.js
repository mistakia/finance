export const appActions = {
  APP_LOAD: 'APP_LOAD',
  APP_LOADED: 'APP_LOADED',

  NEW_KEY: 'NEW_KEY',
  LOAD_KEY: 'LOAD_KEY',

  LOAD_FROM_PRIVATE: 'LOAD_FROM_PRIVATE',

  TOGGLE_HIDE_BALANCES: 'TOGGLE_HIDE_BALANCES',

  toggle_hide_balances: () => ({ type: appActions.TOGGLE_HIDE_BALANCES }),

  load: () => ({
    type: appActions.APP_LOAD
  }),

  loaded: () => ({
    type: appActions.APP_LOADED
  }),

  newKey: ({ privateKey, publicKey }) => ({
    type: appActions.NEW_KEY,
    payload: {
      privateKey,
      publicKey
    }
  }),

  loadKey: ({ privateKey, publicKey }) => ({
    type: appActions.LOAD_KEY,
    payload: {
      privateKey,
      publicKey
    }
  }),

  load_from_private: ({ privateKey, publicKey }) => ({
    type: appActions.LOAD_FROM_PRIVATE,
    payload: {
      privateKey,
      publicKey
    }
  })
}
