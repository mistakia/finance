import debug from 'debug'
// import yargs from 'yargs'
// import { hideBin } from 'yargs/helpers'

// import db from '#db'
// import config from '#config'
import { isMain } from '#common'

// const argv = yargs(hideBin(process.argv)).argv
// const log = debug('template')
debug.enable('template')

const run = async () => {}

export default run

const main = async () => {
  let error
  try {
    await run()
  } catch (err) {
    error = err
    console.log(error)
  }

  /* await db('jobs').insert({
   *   type: constants.jobs.EXAMPLE,
   *   succ: error ? 0 : 1,
   *   reason: error ? error.message : null,
   *   timestamp: Math.round(Date.now() / 1000)
   * })
   */
  process.exit()
}

if (isMain) {
  main()
}
