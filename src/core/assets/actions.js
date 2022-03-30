export const assetsActions = {
  GET_ASSETS: 'GET_ASSETS',

  GET_ASSETS_FAILED: 'GET_ASSETS_FAILED',
  GET_ASSETS_PENDING: 'GET_ASSETS_PENDING',
  GET_ASSETS_FULFILLED: 'GET_ASSETS_FULFILLED',

  getAssetsFailed: (params, error) => ({
    type: assetsActions.GET_ASSETS_FAILED,
    payload: {
      params,
      error
    }
  }),

  getAssetsPending: (params) => ({
    type: assetsActions.GET_ASSETS_PENDING,
    payload: {
      params
    }
  }),

  getAssetsFulfilled: (params, data) => ({
    type: assetsActions.GET_ASSETS_FULFILLED,
    payload: {
      params,
      data
    }
  })
}

export const getAssetsRequestActions = {
  failed: assetsActions.getAssetsFailed,
  pending: assetsActions.getAssetsPending,
  fulfilled: assetsActions.getAssetsFulfilled
}
