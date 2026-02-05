import crypto from 'crypto'

const ALGORITHM = 'aes-256-cbc'
const IV_LENGTH = 16

const validate_key = (key_hex) => {
  if (!key_hex || typeof key_hex !== 'string' || key_hex.length !== 64) {
    throw new Error('key_hex must be exactly 64 hex characters (32 bytes for AES-256)')
  }
}

export function encrypt_aes_256_cbc({ key_hex, plaintext }) {
  validate_key(key_hex)
  const key = Buffer.from(key_hex, 'hex')
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return `ENCRYPTED|${iv.toString('hex')}|${encrypted.toString('hex')}`
}

export function decrypt_aes_256_cbc({ key_hex, encrypted_string }) {
  validate_key(key_hex)
  const parts = encrypted_string.split('|')
  if (parts.length !== 3 || parts[0] !== 'ENCRYPTED') {
    throw new Error('Invalid encrypted string format')
  }
  const iv = Buffer.from(parts[1], 'hex')
  const ciphertext = Buffer.from(parts[2], 'hex')
  const key = Buffer.from(key_hex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return decrypted.toString('utf8')
}
