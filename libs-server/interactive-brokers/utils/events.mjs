export const create_event_promise = ({
  emitter,
  success_event,
  error_event,
  end_event,
  handlers = {},
  timeout_ms = 5000
}) => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Operation timed out'))
    }, timeout_ms)

    const cleanup = () => {
      clearTimeout(timeout)
      emitter.off(success_event, success_handler)
      emitter.off(error_event, error_handler)
      if (end_event) {
        emitter.off(end_event, end_handler)
      }
      // Clean up any custom handlers
      Object.entries(handlers).forEach(([event, handler]) => {
        emitter.off(event, handler)
      })
    }

    const success_handler = (data) => {
      cleanup()
      resolve(data)
    }

    const error_handler = (error) => {
      cleanup()
      reject(error)
    }

    const end_handler = () => {
      cleanup()
      resolve()
    }

    // Set up the main event handlers
    emitter.on(success_event, success_handler)
    emitter.on(error_event, error_handler)
    if (end_event) {
      emitter.on(end_event, end_handler)
    }

    // Set up any custom handlers
    Object.entries(handlers).forEach(([event, handler]) => {
      emitter.on(event, handler)
    })
  })
}

export const create_multi_event_promise = ({
  emitter,
  success_events,
  error_event,
  end_event,
  handlers = {},
  timeout_ms = 5000
}) => {
  return new Promise((resolve, reject) => {
    const results = new Map()
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Operation timed out'))
    }, timeout_ms)

    const cleanup = () => {
      clearTimeout(timeout)
      success_events.forEach((event) => {
        emitter.off(event, success_handlers.get(event))
      })
      emitter.off(error_event, error_handler)
      if (end_event) {
        emitter.off(end_event, end_handler)
      }
      // Clean up any custom handlers
      Object.entries(handlers).forEach(([event, handler]) => {
        emitter.off(event, handler)
      })
    }

    const success_handlers = new Map()
    success_events.forEach((event) => {
      const handler = (data) => {
        results.set(event, data)
        if (results.size === success_events.length) {
          cleanup()
          resolve(Object.fromEntries(results))
        }
      }
      success_handlers.set(event, handler)
      emitter.on(event, handler)
    })

    const error_handler = (error) => {
      cleanup()
      reject(error)
    }

    const end_handler = () => {
      cleanup()
      resolve(Object.fromEntries(results))
    }

    // Set up the main event handlers
    emitter.on(error_event, error_handler)
    if (end_event) {
      emitter.on(end_event, end_handler)
    }

    // Set up any custom handlers
    Object.entries(handlers).forEach(([event, handler]) => {
      emitter.on(event, handler)
    })
  })
}
