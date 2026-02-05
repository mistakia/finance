import express from 'express'

import {
  encrypt_aes_256_cbc,
  decrypt_aes_256_cbc
} from '#root/libs-shared/aes-encryption.mjs'

const router = express.Router()

const get_encryption_key = () => {
  const key_hex = process.env.CONFIG_ENCRYPTION_KEY
  if (!key_hex) {
    throw new Error('CONFIG_ENCRYPTION_KEY environment variable is not set')
  }
  return key_hex
}

router.get('/', async (req, res) => {
  const { log, db } = req.app.locals
  try {
    const { publicKey } = req.query
    if (!publicKey) {
      return res.status(400).send({ error: 'publicKey is required' })
    }

    const key_hex = get_encryption_key()
    const rows = await db('account_connections').where({ public_key: publicKey })

    const connections = []
    const decryption_errors = []
    for (const row of rows) {
      try {
        connections.push({
          id: row.id,
          public_key: row.public_key,
          connection_type: row.connection_type,
          params: JSON.parse(decrypt_aes_256_cbc({ key_hex, encrypted_string: row.encrypted_params })),
          session: row.encrypted_session
            ? JSON.parse(decrypt_aes_256_cbc({ key_hex, encrypted_string: row.encrypted_session }))
            : null,
          last_connection: row.last_connection
        })
      } catch (decrypt_err) {
        log(`Failed to decrypt connection ${row.id}: ${decrypt_err.message}`)
        decryption_errors.push({ id: row.id, error: decrypt_err.message })
      }
    }

    if (decryption_errors.length > 0) {
      res.status(200).send({ connections, decryption_errors })
    } else {
      res.status(200).send(connections)
    }
  } catch (err) {
    log(err)
    res.status(500).send({ error: 'Failed to retrieve connections' })
  }
})

router.post('/', async (req, res) => {
  const { log, db } = req.app.locals
  try {
    const { id, public_key, connection_type, params, session } = req.body

    if (!id || typeof id !== 'string') {
      return res.status(400).send({ error: 'id is required and must be a string' })
    }
    if (!public_key || typeof public_key !== 'string') {
      return res.status(400).send({ error: 'public_key is required and must be a string' })
    }
    if (!connection_type || typeof connection_type !== 'string') {
      return res.status(400).send({ error: 'connection_type is required and must be a string' })
    }
    if (!Array.isArray(params)) {
      return res.status(400).send({ error: 'params is required and must be an array' })
    }
    if (!params.every((p) => p && typeof p.field === 'string' && p.value !== undefined)) {
      return res.status(400).send({ error: 'params must be array of {field, value} objects' })
    }

    const key_hex = get_encryption_key()

    const encrypted_params = encrypt_aes_256_cbc({
      key_hex,
      plaintext: JSON.stringify(params)
    })
    const encrypted_session = session
      ? encrypt_aes_256_cbc({ key_hex, plaintext: JSON.stringify(session) })
      : null

    await db('account_connections')
      .insert({
        id,
        public_key,
        connection_type,
        encrypted_params,
        encrypted_session,
        created_at: db.fn.now(),
        updated_at: db.fn.now()
      })
      .onConflict('id')
      .merge({
        encrypted_params,
        encrypted_session,
        updated_at: db.fn.now()
      })

    res.status(200).send({ success: true })
  } catch (err) {
    log(err)
    res.status(500).send({ error: 'Failed to save connection' })
  }
})

router.delete('/:id', async (req, res) => {
  const { log, db } = req.app.locals
  try {
    const { id } = req.params
    const { publicKey } = req.query

    if (!publicKey) {
      return res.status(400).send({ error: 'publicKey is required' })
    }

    const deleted_count = await db('account_connections')
      .where({ id, public_key: publicKey })
      .del()

    if (deleted_count === 0) {
      return res.status(404).send({ error: 'Connection not found' })
    }

    res.status(200).send({ success: true })
  } catch (err) {
    log(err)
    res.status(500).send({ error: 'Failed to delete connection' })
  }
})

export default router
