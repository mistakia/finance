import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import config from '#config'
import { isMain, addAsset } from '#libs-shared'
import { interactive_brokers } from '#libs-server'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('import-interactive-brokers-accounts')
debug.enable(
  'import-interactive-brokers-accounts,interactive-brokers,refresh-historical-quotes'
)

const import_interactive_brokers_accounts = async ({
  credentials,
  publicKey,
  keep_alive = false
}) => {
  const inserts = []
  try {
    const account_info = await interactive_brokers.get_account_info({
      ...credentials,
      keep_alive
    })
    log(account_info)
    const asset = await addAsset({ type: 'currency', symbol: 'USD' })
    const cash_balance = Number(account_info.TotalCashValue)

    inserts.push({
      link: `/${publicKey}/interactive_brokers/USD`, // TODO - include hash of accountId
      name: 'Cash',
      cost_basis: cash_balance,
      quantity: cash_balance,
      symbol: 'USD',
      asset_link: asset.link
    })
  } catch (err) {
    log(err)
  }

  if (inserts.length) {
    log(`Inserting ${inserts.length} interactive brokers accounts`)
    await db('holdings').insert(inserts).onConflict().merge()
  }
}

const cleanup_containers = async () => {
  try {
    const { host, docker_port = 2375 } = config.links.interactive_brokers
    const containers = await interactive_brokers.get_docker_containers({
      host,
      port: docker_port
    })

    const ib_containers = containers.filter(
      (container) =>
        container.Image === config.ib_gateway_docker_image &&
        container.State === 'running'
    )

    for (const container of ib_containers) {
      await interactive_brokers.stop_docker_container({
        host,
        port: docker_port,
        id: container.Id
      })
      log(`docker container ${container.Id} stopped during cleanup`)
    }
  } catch (err) {
    log('Error during container cleanup:', err)
  }
}

// Setup cleanup handlers
const setup_cleanup_handlers = () => {
  // Handle SIGTERM
  process.on('SIGTERM', async () => {
    log('SIGTERM received, cleaning up...')
    await cleanup_containers()
    process.exit(0)
  })

  // Handle SIGINT (Ctrl+C)
  process.on('SIGINT', async () => {
    log('SIGINT received, cleaning up...')
    await cleanup_containers()
    process.exit(0)
  })
}

const main = async () => {
  setup_cleanup_handlers()

  let error
  try {
    const publicKey = argv.publicKey
    if (!publicKey) {
      console.log('missing --public-key')
      return
    }

    const credentials = config.links.interactive_brokers
    await import_interactive_brokers_accounts({
      publicKey,
      credentials,
      keep_alive: argv.keep_alive
    })
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

  // If keep_alive is not set, clean up containers before exit
  if (!argv.keep_alive) {
    await cleanup_containers()
  }

  process.exit()
}

if (isMain(import.meta.url)) {
  main()
}

export default import_interactive_brokers_accounts
