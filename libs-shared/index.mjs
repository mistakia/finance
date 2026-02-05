import fs from 'fs-extra'
import path, { dirname } from 'path'
import { fileURLToPath } from 'url'

export * as morningstar from './morningstar.mjs'
export * as robinhood from './robinhood.mjs'
export * as alphavantage from './alphavantage.mjs'
export * as coingecko from './coingecko.mjs'
export { default as addAsset } from './add-asset.mjs'
export { default as getType } from './get-type.mjs'
export * as allyInvest from './ally-invest.mjs'
export * as allyBank from './ally-bank.mjs'
export * as peerstreet from './peerstreet.mjs'
export * as gemini from './gemini.mjs'
export * as bitcoin from './bitcoin.mjs'
export * as nano from './nano.mjs'
export * as ethereum from './ethereum.mjs'
export * as wealthfront from './wealthfront.mjs'
export * as groundfloor from './groundfloor.mjs'
export * as schwab from './schwab.mjs'
export * as stellar from './stellar.mjs'
export * as litecoin from './litecoin.mjs'
export * as finnhub from './finnhub.mjs'
export * as fidelity from './fidelity.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const session_path = path.join(__dirname, '../session.json')

export const isMain = (path) => process.argv[1] === fileURLToPath(path)
export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
export const average = (array) => array.reduce((a, b) => a + b) / array.length
export const median = (arr) => {
  const middle = Math.floor(arr.length / 2)
  arr = [...arr].sort((a, b) => a - b)
  return arr.length % 2 !== 0
    ? arr[middle]
    : (arr[middle - 1] + arr[middle]) / 2
}

export const slugify = (text) =>
  text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/&/g, '-and-') // Replace & with 'and'
    .replace(/[^\w-]+/g, '') // Remove all non-word chars
    .replace(/--+/g, '-') // Replace multiple - with single -
    .replace(/^-+/, '') // Trim - from start of text
    .replace(/-+$/, '') // Trim - from end of text

export const getSession = async () => {
  let session
  try {
    session = await fs.readJson(session_path)
  } catch (err) {
    console.log(err)
  }

  return session || {}
}

export const saveSession = async (session) => {
  await fs.writeJson(session_path, session)
}

export const get_api_url = (config) => {
  const port = config?.port || 8080
  return `http://localhost:${port}/api`
}

export const fetch_with_timeout = async (url, options = {}, timeout_ms = 30000) => {
  const controller = new AbortController()
  const timeout_id = setTimeout(() => controller.abort(), timeout_ms)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    })
    return response
  } finally {
    clearTimeout(timeout_id)
  }
}

export const fetch_json = async (url, options = {}, timeout_ms = 30000) => {
  const response = await fetch_with_timeout(url, options, timeout_ms)

  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`)
  }

  const content_type = response.headers.get('content-type')
  if (!content_type?.includes('application/json')) {
    throw new Error(`Expected JSON response but got: ${content_type}`)
  }

  return response.json()
}
