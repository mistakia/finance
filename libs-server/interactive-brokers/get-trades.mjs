import debug from 'debug'

import {
  start_docker_container,
  stop_docker_container,
  get_docker_containers
} from './docker.mjs'
import { create_ib_client, connect_ib_with_retry } from './connection.mjs'
import { get_executions, get_completed_orders } from './client/raw-data.mjs'
import config from '#config'

const log = debug('interactive-brokers:trades')

const normalize_execution = ({ contract, execution }) => ({
  tradeID: execution.execId,
  transactionID: execution.execId,
  symbol: contract.symbol,
  quantity: execution.shares,
  tradePrice: execution.price,
  price: execution.price,
  proceeds: execution.shares * execution.price * (execution.side === 'SLD' ? 1 : -1),
  buySell: execution.side === 'BOT' ? 'BUY' : execution.side === 'SLD' ? 'SELL' : execution.side,
  side: execution.side,
  tradeDate: execution.time,
  dateTime: execution.time,
  assetCategory: contract.secType,
  strike: contract.strike || null,
  expiry: contract.lastTradeDateOrContractMonth || null,
  putCall: contract.right || null,
  exchange: execution.exchange,
  account: execution.acctNumber,
  avgPrice: execution.avgPrice,
  cumQty: execution.cumQty,
  ibCommission: 0
})

const normalize_completed_order = ({ contract, order, orderState }) => ({
  tradeID: `order_${order.orderId}_${order.permId}`,
  transactionID: `order_${order.orderId}_${order.permId}`,
  symbol: contract.symbol,
  quantity: order.filledQuantity || order.totalQuantity,
  tradePrice: order.avgFillPrice || order.lmtPrice || 0,
  price: order.avgFillPrice || order.lmtPrice || 0,
  proceeds:
    (order.filledQuantity || order.totalQuantity) *
    (order.avgFillPrice || order.lmtPrice || 0) *
    (order.action === 'SELL' ? 1 : -1),
  buySell: order.action,
  side: order.action === 'BUY' ? 'BOT' : 'SLD',
  tradeDate: orderState.completedTime,
  dateTime: orderState.completedTime,
  assetCategory: contract.secType,
  strike: contract.strike || null,
  expiry: contract.lastTradeDateOrContractMonth || null,
  putCall: contract.right || null,
  exchange: contract.exchange || order.exchange,
  account: order.account,
  ibCommission: parseFloat(orderState.commission) || 0
})

export const get_trades = async ({
  host,
  docker_port = 2375,
  ibkr_port = 4002,
  keep_alive = false
}) => {
  const containers = await get_docker_containers({
    host,
    port: docker_port
  })
  const container = containers.find(
    (c) => c.Image === config.ib_gateway_docker_image
  )

  if (!container) {
    throw new Error('ib-gateway-docker container not found')
  }

  let container_just_started = false
  if (container.State !== 'running') {
    const res_status = await start_docker_container({
      host,
      port: docker_port,
      id: container.Id
    })
    log(`docker container started (status: ${res_status})`)
    container_just_started = true
  }

  const ib = create_ib_client({ host, port: ibkr_port })

  try {
    await connect_ib_with_retry({
      ib,
      initial_delay: container_just_started ? 5000 : 2000
    })

    // Fetch executions (current day's trades)
    log('Fetching executions...')
    const executions = await get_executions(ib)
    log(`Received ${executions.length} executions`)

    // Fetch completed orders (historical filled orders)
    log('Fetching completed orders...')
    const completed_orders = await get_completed_orders(ib)
    log(`Received ${completed_orders.length} completed orders`)

    // Normalize both into a common trade format
    const trades = [
      ...executions.map(normalize_execution),
      ...completed_orders
        .filter(
          ({ orderState }) =>
            orderState.status === 'Filled' || orderState.status === 'Inactive'
        )
        .map(normalize_completed_order)
    ]

    // Deduplicate: executions may overlap with completed orders
    const seen_ids = new Set()
    const unique_trades = []
    for (const trade of trades) {
      const key = `${trade.symbol}_${trade.quantity}_${trade.tradePrice}_${trade.buySell}_${trade.dateTime}`
      if (!seen_ids.has(key)) {
        seen_ids.add(key)
        unique_trades.push(trade)
      }
    }

    log(`Total unique trades: ${unique_trades.length}`)

    ib.disconnect()

    if (!keep_alive) {
      const res_stop_status = await stop_docker_container({
        host,
        port: docker_port,
        id: container.Id
      })
      log(`docker container stopped (status: ${res_stop_status})`)
    }

    return unique_trades
  } catch (error) {
    console.error(error)
    throw new Error(`Error fetching trades: ${error.message}`)
  }
}
