/* global AbortController, fetch */

// import queryString from 'query-string'
import merge from 'merge-options'

import { API_URL } from '@core/constants'

const POST = (data) => ({
  method: 'POST',
  body: JSON.stringify(data),
  headers: {
    'Content-Type': 'application/json'
  }
})

const DELETE = () => ({
  method: 'DELETE'
})

export const api = {
  postJob(data) {
    const url = `${API_URL}/jobs`
    return { url, ...POST(data) }
  },
  getAssets({ publicKey }) {
    const url = `${API_URL}/assets/${publicKey}`
    return { url }
  },
  getConnections({ public_key }) {
    const url = `${API_URL}/connections?publicKey=${public_key}`
    return { url }
  },
  saveConnection(data) {
    const url = `${API_URL}/connections`
    return { url, ...POST(data) }
  },
  deleteConnection({ id, public_key }) {
    const url = `${API_URL}/connections/${id}?publicKey=${public_key}`
    return { url, ...DELETE() }
  }
}

const DEFAULT_TIMEOUT_MS = 30000

export const apiRequest = (apiFunction, opts) => {
  const controller = new AbortController()
  const abort = controller.abort.bind(controller)
  const defaultOptions = {}
  const options = merge(defaultOptions, apiFunction(opts), {
    signal: controller.signal
  })

  const request_with_timeout = async () => {
    const timeout_id = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
    try {
      return await dispatchFetch(options)
    } finally {
      clearTimeout(timeout_id)
    }
  }

  return { abort, request: request_with_timeout }
}

export const dispatchFetch = async (options) => {
  const response = await fetch(options.url, options)
  if (response.status >= 200 && response.status < 300) {
    return response.json()
  } else {
    const res = await response.json()
    const error = new Error(res.error || response.statusText)
    error.response = response
    throw error
  }
}
