import fs from 'fs-extra'
import path from 'path'
import debug from 'debug'
import { homedir } from 'os'

const log = debug('cache')

const cache_path = path.join(homedir(), '.finance/cache')

/**
 * Save a value to the cache
 * @param {Object} params - Parameters for saving to cache
 * @param {string} params.key - Cache key
 * @param {*} params.value - Value to cache
 * @returns {Promise<*>} - The cached value
 */
export const set = async ({ key, value }) => {
  try {
    // Sanitize the key by removing any '..' or '.' characters
    const sanitized_key = key.replace(/(\.\.\/|\.\/)/g, '')
    const full_path = path.join(cache_path, sanitized_key)

    // Ensure the directory exists
    await fs.ensureDir(path.dirname(full_path))

    // Write the value to the cache file with timestamp
    const cache_data = {
      value,
      timestamp: Date.now()
    }
    await fs.writeJson(full_path, cache_data, { spaces: 2 })

    log(`Cached value for key: ${key}`)
    return value
  } catch (error) {
    log(`Error saving to cache: ${error}`)
    throw error
  }
}

/**
 * Get a value from the cache
 * @param {Object} params - Parameters for reading from cache
 * @param {string} params.key - Cache key
 * @param {number} [params.max_age_ms=86400000] - Maximum age of cache in milliseconds (default 24 hours)
 * @returns {Promise<*>} - The cached value or null if not found or expired
 */
export const get = async ({ key, max_age_ms = 86400000 }) => {
  try {
    // Sanitize the key by removing any '..' or '.' characters
    const sanitized_key = key.replace(/(\.\.\/|\.\/)/g, '')
    const full_path = path.join(cache_path, sanitized_key)

    // Check if the full_path is within the cache_path directory
    const relative_path = path.relative(cache_path, full_path)
    const is_subpath =
      !!relative_path &&
      !relative_path.startsWith('..') &&
      !path.isAbsolute(relative_path)

    if (!is_subpath) {
      log(`Invalid cache key: ${key}`)
      return null
    }

    // Check if the file exists
    const path_exists = await fs.pathExists(full_path)
    if (!path_exists) {
      log(`Cache miss for key: ${key}`)
      return null
    }

    // Read the cached data
    const cache_data = await fs.readJson(full_path)

    // Check if cache is expired
    const age_ms = Date.now() - cache_data.timestamp
    if (age_ms > max_age_ms) {
      log(`Cache expired for key: ${key} (age: ${age_ms}ms)`)
      return null
    }

    log(`Cache hit for key: ${key} (age: ${age_ms}ms)`)
    return cache_data.value
  } catch (error) {
    log(`Error reading from cache: ${error}`)
    return null
  }
}
