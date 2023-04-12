import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

// import db from '#db'
import config from '#config'
import { isMain, peerstreet } from '#common'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-peerstreet-transactions')
debug.enable('import-peerstreet-transactions')

const import_peerstreet_transactions = async ({ credentials, publicKey }) => {
  let transactions
  try {
    transactions = await peerstreet.get_transactions({
      publicKey,
      ...credentials
    })
  } catch (err) {
    log(err)
  }

  log(transactions)
  log(transactions[0])

  // TODO
}

const main = async () => {
  let error
  try {
    const publicKey = argv.publicKey
    if (!publicKey) {
      console.log('missing --public-key')
      return
    }
    const credentials = config.links.peerstreet
    log({ credentials, publicKey })
    await import_peerstreet_transactions({ credentials, publicKey })
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

if (isMain(import.meta.url)) {
  main()
}

export default import_peerstreet_transactions
