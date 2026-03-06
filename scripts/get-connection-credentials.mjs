import debug from 'debug'

import config from '#config'
import { isMain, get_api_url, fetch_json } from '#libs-shared'

const log = debug('get-connection-credentials')

const get_credentials_from_api = async ({ connection_type, public_key }) => {
  const api_url = get_api_url(config)
  const url = `${api_url}/connections?publicKey=${public_key}`

  const connections = await fetch_json(url)
  const match = connections.find((c) => c.connection_type === connection_type)

  if (!match) {
    return null
  }

  // convert params array [{field, value}] to flat credentials object {field: value}
  const credentials = {}
  for (const param of match.params) {
    credentials[param.field] = param.value
  }

  return { credentials, session: match.session }
}

export const get_connection_credentials = async ({ connection_type, public_key }) => {
  const result = await get_credentials_from_api({ connection_type, public_key })
  if (result) {
    log(`loaded credentials for ${connection_type} from database`)
    return result
  }

  return null
}

export const get_all_connection_credentials = async ({ connection_type, public_key }) => {
  const api_url = get_api_url(config)
  const url = `${api_url}/connections?publicKey=${public_key}`

  const connections = await fetch_json(url)
  const matches = connections.filter((c) => c.connection_type === connection_type)

  if (!matches.length) {
    return []
  }

  return matches.map((match) => {
    const credentials = {}
    for (const param of match.params) {
      credentials[param.field] = param.value
    }
    return { credentials, session: match.session }
  })
}

const main = async () => {
  const args = process.argv.slice(2)
  const connection_type = args.find((a) => !a.startsWith('--'))
  const public_key_arg = args.find((a) => a.startsWith('--publicKey='))
  const public_key = public_key_arg ? public_key_arg.split('=')[1] : null

  if (!connection_type || !public_key) {
    console.log('Usage: node scripts/get-connection-credentials.mjs <connection_type> --publicKey=<key>')
    process.exit(1)
  }

  const result = await get_connection_credentials({ connection_type, public_key })
  if (result) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`No credentials found for ${connection_type}`)
    process.exit(1)
  }

  process.exit()
}

if (isMain(import.meta.url)) {
  main()
}
