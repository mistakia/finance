import crypto from 'crypto'
import fetch from 'node-fetch'

const BASE_URL = 'https://api.kraken.com'
const RATE_LIMIT_DELAY = 4000

const SYMBOL_MAP = {
  XXBT: 'BTC',
  XBTC: 'BTC',
  XETH: 'ETH',
  XLTC: 'LTC',
  XXRP: 'XRP',
  XXLM: 'XLM',
  XDOGE: 'DOGE',
  XREP: 'REP',
  XMLN: 'MLN',
  XXMR: 'XMR',
  XETC: 'ETC',
  XZEC: 'ZEC',
  ZUSD: 'USD',
  ZEUR: 'EUR',
  ZCAD: 'CAD',
  ZGBP: 'GBP',
  ZJPY: 'JPY'
}

export const normalizeAssetSymbol = (symbol) => {
  if (!symbol) return symbol
  // Strip .S, .B, .F, .M suffixes (staking/bonded/flexible/margin variants)
  const stripped = symbol.replace(/\.[SBFM]$/, '')
  if (SYMBOL_MAP[stripped]) return SYMBOL_MAP[stripped]
  // 4-char symbols starting with X or Z that aren't in the map
  if (stripped.length === 4 && (stripped[0] === 'X' || stripped[0] === 'Z')) {
    return stripped.slice(1)
  }
  return stripped
}

const getSignature = ({ urlPath, data, secret }) => {
  const message = data.nonce + new URLSearchParams(data).toString()
  const hash = crypto.createHash('sha256').update(message).digest()
  const hmac = crypto
    .createHmac('sha512', Buffer.from(secret, 'base64'))
    .update(Buffer.concat([Buffer.from(urlPath), hash]))
    .digest('base64')
  return hmac
}

const requestPrivate = async ({ endpoint, key, secret, params = {} }) => {
  const urlPath = `/0/private/${endpoint}`
  const url = `${BASE_URL}${urlPath}`

  const data = {
    nonce: Date.now() * 1000,
    ...params
  }

  const signature = getSignature({ urlPath, data, secret })

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'API-Key': key,
      'API-Sign': signature,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams(data).toString()
  })

  const json = await response.json()
  if (json.error && json.error.length) {
    throw new Error(`Kraken API error: ${json.error.join(', ')}`)
  }
  return json.result
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export const getBalances = async ({ key, secret }) => {
  return requestPrivate({ endpoint: 'BalanceEx', key, secret })
}

export const getLedgers = async ({ key, secret, type, start, end, asset }) => {
  const all_ledgers = {}
  let offset = 0

  while (true) {
    const params = { ofs: offset }
    if (type) params.type = type
    if (start) params.start = start
    if (end) params.end = end
    if (asset) params.asset = asset

    const result = await requestPrivate({
      endpoint: 'Ledgers',
      key,
      secret,
      params
    })

    const ledger = result.ledger || {}
    const entries = Object.entries(ledger)
    if (entries.length === 0) break

    for (const [id, entry] of entries) {
      all_ledgers[id] = entry
    }

    const count = result.count || 0
    offset += entries.length
    if (offset >= count) break

    await delay(RATE_LIMIT_DELAY)
  }

  return all_ledgers
}

export const getTradeHistory = async ({ key, secret, start, end }) => {
  const all_trades = {}
  let offset = 0

  while (true) {
    const params = { ofs: offset }
    if (start) params.start = start
    if (end) params.end = end

    const result = await requestPrivate({
      endpoint: 'TradesHistory',
      key,
      secret,
      params
    })

    const trades = result.trades || {}
    const entries = Object.entries(trades)
    if (entries.length === 0) break

    for (const [id, trade] of entries) {
      all_trades[id] = trade
    }

    const count = result.count || 0
    offset += entries.length
    if (offset >= count) break

    await delay(RATE_LIMIT_DELAY)
  }

  return all_trades
}

export const getEarnAllocations = async ({ key, secret }) => {
  return requestPrivate({ endpoint: 'Earn/Allocations', key, secret })
}
