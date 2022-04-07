import eccrypto from 'eccrypto'

export { localStorageAdapter } from './local-storage'
export { fuzzySearch } from './fuzzy-search'

export async function encrypt(publicKey, data) {
  const msg = JSON.stringify(data)
  const cypher = await eccrypto.encrypt(
    Buffer.from(publicKey, 'hex'),
    Buffer.from(msg)
  )
  const blob = [
    cypher.ciphertext.toString('base64'),
    cypher.ephemPublicKey.toString('base64'),
    cypher.iv.toString('base64'),
    cypher.mac.toString('base64')
  ].join('|')
  return blob
}

export async function decrypt(privateKey, blob) {
  const parts = blob.split('|')
  const cypher = {
    ciphertext: Buffer.from(parts[0], 'base64'),
    ephemPublicKey: Buffer.from(parts[1], 'base64'),
    iv: Buffer.from(parts[2], 'base64'),
    mac: Buffer.from(parts[3], 'base64')
  }

  const message = await eccrypto.decrypt(Buffer.from(privateKey, 'hex'), cypher)
  return JSON.parse(message.toString('utf8'))
}

export const sum = (arr) => arr.reduce((a, b) => a + b, 0)
