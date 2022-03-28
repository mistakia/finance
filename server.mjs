import debug from 'debug'

import server from './api/index.mjs'
import config from './config.mjs'

const logger = debug('server')
debug.enable('server,api,knex')

const main = async () => {
  const { port } = config
  server.listen(port, () => logger(`API listening on port ${port}`))
}

try {
  main()
} catch (err) {
  // TODO move to stderr
  logger(err)
}
