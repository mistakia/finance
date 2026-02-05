import readline from 'readline'
import { stdin as input, stdout as output } from 'process'

import config from '#config'
import { isMain, get_api_url, fetch_with_timeout } from '#libs-shared'
import { CONNECTIONS } from '#root/libs-shared/connections.mjs'

// Fields that should have hidden input (sensitive)
const SENSITIVE_PATTERNS = ['password', 'secret', 'token', 'cookie', 'key']

const is_sensitive_field = (field) => {
  const lower = field.toLowerCase()
  return SENSITIVE_PATTERNS.some((pattern) => lower.includes(pattern))
}

const prompt_field = async (rl, field, is_sensitive) => {
  return new Promise((resolve) => {
    const prompt_text = `${field}${is_sensitive ? ' (hidden)' : ''}: `

    if (is_sensitive) {
      // Hide input for sensitive fields
      process.stdout.write(prompt_text)
      const stdin = process.stdin
      const was_raw = stdin.isRaw
      stdin.setRawMode(true)
      stdin.resume()
      stdin.setEncoding('utf8')

      let value = ''
      const on_data = (char) => {
        if (char === '\n' || char === '\r') {
          stdin.setRawMode(was_raw)
          stdin.pause()
          stdin.removeListener('data', on_data)
          process.stdout.write('\n')
          resolve(value)
        } else if (char === '\u0003') {
          // Ctrl+C
          process.exit(1)
        } else if (char === '\u007F' || char === '\b') {
          // Backspace
          if (value.length > 0) {
            value = value.slice(0, -1)
          }
        } else {
          value += char
        }
      }
      stdin.on('data', on_data)
    } else {
      rl.question(prompt_text, resolve)
    }
  })
}

const prompt_credentials = async (connection_def) => {
  const rl = readline.createInterface({ input, output })
  const params = []

  try {
    for (const field of connection_def.params) {
      const is_sensitive = is_sensitive_field(field)
      const value = await prompt_field(rl, field, is_sensitive)
      params.push({ field, value })
    }
  } finally {
    rl.close()
  }

  return params
}

const save_connection = async ({ id, public_key, connection_type, params }) => {
  const api_url = get_api_url(config)
  const url = `${api_url}/connections`

  const response = await fetch_with_timeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      public_key,
      connection_type,
      params
    })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(`API request failed: ${error.error || response.statusText}`)
  }

  return response.json()
}

export const save_credentials_interactive = async ({ connection_type, public_key }) => {
  const connection_def = CONNECTIONS.find((c) => c.id === connection_type)
  if (!connection_def) {
    throw new Error(`Unknown connection type: ${connection_type}`)
  }

  const params = await prompt_credentials(connection_def)
  const param_id_field = params.find((p) => p.field === connection_def.params_id)
  const id = `${connection_type}/${param_id_field.value}`.toLowerCase()

  await save_connection({ id, public_key, connection_type, params })
  return { id }
}

export const save_credentials_from_json = async ({ connection_type, public_key, credentials }) => {
  const connection_def = CONNECTIONS.find((c) => c.id === connection_type)
  if (!connection_def) {
    throw new Error(`Unknown connection type: ${connection_type}`)
  }

  // Validate all required fields are present
  for (const field of connection_def.params) {
    if (!(field in credentials)) {
      throw new Error(`Missing required field: ${field}`)
    }
  }

  // Convert flat object to params array format
  const params = connection_def.params.map((field) => ({
    field,
    value: credentials[field]
  }))

  const param_id_value = credentials[connection_def.params_id]
  const id = `${connection_type}/${param_id_value}`.toLowerCase()

  await save_connection({ id, public_key, connection_type, params })
  return { id }
}

const print_usage = () => {
  console.log(`
Usage:
  Interactive mode:
    node scripts/save-connection-credentials.mjs <connection_type> --publicKey=<key>

  Environment variable mode:
    CONNECTION_CREDENTIALS='{"username":"x","password":"y"}' \\
      node scripts/save-connection-credentials.mjs <connection_type> --publicKey=<key> --env

Available connection types:
  ${CONNECTIONS.map((c) => c.id).join(', ')}

Examples:
  # Interactive (prompts for each field, passwords hidden)
  node scripts/save-connection-credentials.mjs ally-bank --publicKey=abc123

  # From password manager (credentials never in shell history)
  CONNECTION_CREDENTIALS=$(op read "op://vault/ally-bank") \\
    node scripts/save-connection-credentials.mjs ally-bank --publicKey=abc123 --env

  # Manual entry via environment variable
  read -s CREDS && CONNECTION_CREDENTIALS="$CREDS" \\
    node scripts/save-connection-credentials.mjs ally-bank --publicKey=abc123 --env
`)
}

const main = async () => {
  const args = process.argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    print_usage()
    process.exit(0)
  }

  const connection_type = args.find((a) => !a.startsWith('--'))
  const public_key_arg = args.find((a) => a.startsWith('--publicKey='))
  const public_key = public_key_arg ? public_key_arg.split('=')[1] : null
  const use_env = args.includes('--env')

  if (!connection_type || !public_key) {
    print_usage()
    process.exit(1)
  }

  const connection_def = CONNECTIONS.find((c) => c.id === connection_type)
  if (!connection_def) {
    console.error(`Unknown connection type: ${connection_type}`)
    console.error(`Available: ${CONNECTIONS.map((c) => c.id).join(', ')}`)
    process.exit(1)
  }

  try {
    let result

    if (use_env) {
      // Read from environment variable
      const env_value = process.env.CONNECTION_CREDENTIALS
      if (!env_value) {
        console.error('CONNECTION_CREDENTIALS environment variable not set')
        process.exit(1)
      }
      const credentials = JSON.parse(env_value)
      result = await save_credentials_from_json({ connection_type, public_key, credentials })
    } else {
      // Interactive mode
      result = await save_credentials_interactive({ connection_type, public_key })
    }

    console.log(`Saved connection: ${result.id}`)
  } catch (err) {
    console.error(`Error: ${err.message}`)
    process.exit(1)
  }

  process.exit(0)
}

if (isMain(import.meta.url)) {
  main()
}
