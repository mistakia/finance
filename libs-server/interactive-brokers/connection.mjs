import { IBApiNext, EventName } from '@stoqey/ib'
import debug from 'debug'
import { create_event_promise } from './utils/events.mjs'
import { with_retry } from './utils/retry.mjs'

const log = debug('interactive-brokers:connection')

export const connect_ib = (ib) => {
  return new Promise((resolve, reject) => {
    create_event_promise({
      emitter: ib.api,
      success_event: EventName.connected,
      error_event: EventName.error,
      timeout_ms: 30000
    })
      .then(() => {
        resolve()
      })
      .catch((error) => {
        log('Connection error:', error)
        reject(error)
      })

    // Initiate the connection
    ib.connect()
  })
}

export const connect_ib_with_retry = async ({
  ib,
  max_attempts = 3,
  initial_delay = 2000
}) => {
  return await with_retry({
    operation: async () => {
      await connect_ib(ib)
      return ib
    },
    max_attempts,
    initial_delay_ms: initial_delay,
    max_delay_ms: 30000,
    backoff_factor: 2
  })
}

export const create_ib_client = ({ host, port }) => {
  return new IBApiNext({
    host,
    port
  })
}
