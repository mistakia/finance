/* global IS_DEV */
//= ====================================
//  GENERAL
// -------------------------------------
export const BASE_URL = IS_DEV
  ? 'http://192.168.1.113:8084'
  : 'https://tint.finance'
export const API_URL = `${BASE_URL}/api`
export const WEBSOCKET_URL = IS_DEV
  ? 'ws://192.168.1.113:8084'
  : 'wss://tint.finance'
