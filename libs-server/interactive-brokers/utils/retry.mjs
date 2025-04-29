import debug from 'debug'

const log = debug('interactive-brokers:retry')

export const with_retry = async ({
  operation,
  max_attempts = 3,
  initial_delay_ms = 1000,
  max_delay_ms = 10000,
  backoff_factor = 2
}) => {
  let attempt = 0
  let delay = initial_delay_ms

  while (attempt < max_attempts) {
    try {
      log(`Attempt ${attempt + 1}/${max_attempts}`)
      await new Promise((resolve) => setTimeout(resolve, delay))
      return await operation()
    } catch (error) {
      attempt++

      if (attempt >= max_attempts) {
        log(`All ${max_attempts} attempts failed`)
        throw error
      }

      log(`Attempt ${attempt} failed, retrying in ${delay}ms: ${error.message}`)

      // Apply exponential backoff with max delay cap
      delay = Math.min(delay * backoff_factor, max_delay_ms)
    }
  }
}
