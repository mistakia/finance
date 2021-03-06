export const jobActions = {
  POST_JOB_FAILED: 'POST_JOB_FAILED',
  POST_JOB_PENDING: 'POST_JOB_PENDING',
  POST_JOB_FULFILLED: 'POST_JOB_FULFILLED',

  postJobFailed: (params, error) => ({
    type: jobActions.POST_JOB_FAILED,
    payload: {
      params,
      error
    }
  }),

  postJobPending: (params) => ({
    type: jobActions.POST_JOB_PENDING,
    payload: {
      params
    }
  }),

  postJobFulfilled: (params, data) => ({
    type: jobActions.POST_JOB_FULFILLED,
    payload: {
      params,
      data
    }
  })
}

export const postJobRequestActions = {
  failed: jobActions.postJobFailed,
  pending: jobActions.postJobPending,
  fulfilled: jobActions.postJobFulfilled
}
