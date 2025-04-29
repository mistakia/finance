import { IBApiNext, EventName } from '@stoqey/ib'
import debug from 'debug'

const log = debug('interactive-brokers:connection')

const wait_for_service = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms))

const connect_ib = (ib) =>
  new Promise((resolve, reject) => {
    const cleanup_listeners = []
    let timeout_id = null

    const connected_handler = () => {
      cleanup()
      resolve()
    }

    const error_handler = (err) => {
      cleanup()
      reject(err)
    }

    const cleanup = () => {
      cleanup_listeners.forEach((remove) => remove())
      if (timeout_id) {
        clearTimeout(timeout_id)
      }
    }

    cleanup_listeners.push(
      () => ib.api.off(EventName.connected, connected_handler),
      () => ib.api.off(EventName.error, error_handler)
    )

    ib.api.on(EventName.connected, connected_handler)
    ib.api.on(EventName.error, error_handler)

    ib.connect()

    // Set connection timeout
    timeout_id = setTimeout(() => {
      cleanup()
      reject(new Error('Connection timeout after 30 seconds'))
    }, 30000)
  })

export const connect_ib_with_retry = async ({
  ib,
  max_retries = 5,
  initial_delay = 2000,
  max_delay = 10000
}) => {
  let current_delay = initial_delay
  let retry_count = 0

  while (retry_count < max_retries) {
    try {
      await wait_for_service(current_delay)
      await connect_ib(ib)
      log(
        `Successfully connected to IB Gateway after ${
          retry_count + 1
        } attempt(s)`
      )
      return
    } catch (error) {
      retry_count++
      if (retry_count === max_retries) {
        throw new Error(
          `Failed to connect after ${max_retries} attempts: ${error.message}`
        )
      }
      log(
        `Connection attempt ${retry_count} failed, retrying in ${
          current_delay / 1000
        }s...`
      )
      // Exponential backoff with max delay
      current_delay = Math.min(current_delay * 2, max_delay)
    }
  }
}

export const create_ib_client = ({ host, port }) => {
  return new IBApiNext({
    host,
    port
  })
}
