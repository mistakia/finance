export const appActions = {
  APP_LOAD: 'APP_LOAD',
  APP_LOADED: 'APP_LOADED',

  SAVE_KEY: 'SAVE_KEY',
  SET_KEY: 'SET_KEY',

  load: () => ({
    type: appActions.APP_LOAD
  }),

  loaded: () => ({
    type: appActions.APP_LOADED
  }),

  saveKey: ({ privateKey, publicKey }) => ({
    type: appActions.SAVE_KEY,
    payload: {
      privateKey,
      publicKey
    }
  }),

  setKey: ({ privateKey, publicKey }) => ({
    type: appActions.SET_KEY,
    payload: {
      privateKey,
      publicKey
    }
  })
}
