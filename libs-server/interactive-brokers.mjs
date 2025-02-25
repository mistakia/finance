import fetch from 'node-fetch'
import dayjs from 'dayjs'
import debug from 'debug'
import {
  IBApiNext,
  EventName,
  IBApiNextTickType,
  IBApiTickType
} from '@stoqey/ib'

const log = debug('interactive-brokers')

const start_docker_container = async ({ host, port = 2375, id }) => {
  const url = `http://${host}:${port}/containers/${id}/start`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  })

  return response.status
}

const stop_docker_container = async ({ host, port = 2375, id }) => {
  const url = `http://${host}:${port}/containers/${id}/stop`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  })

  return response.status
}

const get_docker_containers = async ({ host, port = 2375 }) => {
  const url = `http://${host}:${port}/containers/json?all=true`
  const response = await fetch(url)
  return response.json()
}

const account_summary_tags = [
  'NetLiquidation',
  'TotalCashValue',
  'SettledCash',
  'GrossPositionValue'
]
const get_account_summary = (ib) =>
  new Promise((resolve, reject) => {
    let account_summary

    ib.api.on(EventName.accountSummaryEnd, () => {
      resolve(account_summary.all.values().next().value)
    })

    ib.getAccountSummary('All', account_summary_tags.join(',')).subscribe({
      next: (data) => {
        account_summary = data
      },
      error: (err) => {
        reject(err)
      }
    })
  })

const get_account_positions = (ib) =>
  new Promise((resolve, reject) => {
    let account_positions

    ib.api.on(EventName.positionEnd, () => {
      resolve(account_positions.all.values().next().value)
    })

    ib.getPositions().subscribe({
      next: (data) => {
        account_positions = data
      },
      error: (err) => {
        reject(err)
      }
    })
  })

const get_market_data = (ib, contract) =>
  new Promise((resolve, reject) => {
    let marketData = {
      price: null,
      impliedVol: null,
      delta: null,
      undPrice: null
    }
    let hasReceivedData = false

    const contractWithExchange = {
      ...contract,
      exchange: contract.exchange || 'SMART'
    }

    const subscription = ib
      .getMarketData(contractWithExchange, null, false, false)
      .subscribe({
        next: (update) => {
          const update_data = new Map()
          // Handle regular market data updates
          update.all.forEach((tick, type) => {
            if (type > IBApiNextTickType.API_NEXT_FIRST_TICK_ID) {
              update_data.set(IBApiNextTickType[type], tick.value)
            } else {
              update_data.set(IBApiTickType[type], tick.value)
            }

            // Extract relevant data from the ticks
            const modelDelta = update_data.get('MODEL_OPTION_DELTA')
            const modelIV = update_data.get('MODEL_OPTION_IV')
            const underlyingPrice = update_data.get('OPTION_UNDERLYING')

            if (modelDelta || modelIV || underlyingPrice) {
              marketData = {
                ...marketData,
                delta: modelDelta ? Math.abs(modelDelta) : marketData.delta,
                impliedVol: modelIV || marketData.impliedVol,
                undPrice: underlyingPrice || marketData.undPrice
              }
              hasReceivedData = true
            }
          })
        },
        error: (err) => {
          reject(err)
        }
      })

    // Cleanup subscription and resolve after receiving data or timeout
    setTimeout(() => {
      subscription.unsubscribe()
      if (!hasReceivedData) {
        console.warn(
          `No market data received for contract: ${JSON.stringify(
            contractWithExchange
          )}`
        )
      }
      resolve(marketData)
    }, 5000)
  })

export const get_account_info = async ({
  host,
  docker_port = 2375,
  ibkr_port = 4002,
  keep_alive = false
}) => {
  const containers = await get_docker_containers({ host, port: docker_port })
  const container = containers.find(
    (container) => container.Image === 'rylorin/ib-gateway-docker'
  )

  if (!container) {
    throw new Error('ib-gateway-docker container not found')
  }

  if (container.State !== 'running') {
    const res_status = await start_docker_container({
      host,
      port: docker_port,
      id: container.Id
    })
    log(`docker container started (status: ${res_status})`)
  }

  const ib = new IBApiNext({
    host,
    port: ibkr_port
  })
  ib.connect()

  const account_positions = await get_account_positions(ib)

  const account_summary = await get_account_summary(ib)

  // Fetch market data for all short options positions
  const short_options = account_positions.filter(
    (position) => position.contract.secType === 'OPT' && position.pos < 0
  )

  const positions_with_market_data = await Promise.all(
    short_options.map(async (position) => {
      const market_data = await get_market_data(ib, position.contract)
      return { ...position, market_data }
    })
  )

  // Calculate liabilities at different probability thresholds
  const probability_thresholds = [0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.7, 0.9]
  const liability_by_probability = {}

  // Create a map of stock positions by symbol
  const stock_positions = new Map(
    account_positions
      .filter((position) => position.contract.secType === 'STK')
      .map((position) => [position.contract.symbol, position])
  )

  const result = {}
  for (const tag of account_summary_tags) {
    const item = account_summary.get(tag)
    if (item) {
      result[tag] = Number(item.get('USD').value)
    }
  }

  // Calculate option liabilities considering covered positions
  result.option_cash_liability = Math.abs(
    account_positions
      .filter(
        (position) => position.contract.secType === 'OPT' && position.pos < 0
      )
      .reduce((acc, position) => {
        const stock_position = stock_positions.get(position.contract.symbol)
        const shares_held = stock_position ? stock_position.pos : 0
        const contracts = Math.abs(position.pos)
        const shares_needed = contracts * position.contract.multiplier

        if (position.contract.right === 'C' && shares_held >= shares_needed) {
          // Call is fully covered by shares, no liability
          return acc
        } else if (position.contract.right === 'C' && shares_held > 0) {
          // Call is partially covered, calculate remaining liability
          const uncovered_contracts =
            (shares_needed - shares_held) / position.contract.multiplier
          return (
            acc +
            position.contract.strike *
              uncovered_contracts *
              position.contract.multiplier
          )
        } else {
          // Put or uncovered call
          return (
            acc +
            position.contract.strike * contracts * position.contract.multiplier
          )
        }
      }, 0)
  )

  result.liabilities = account_positions
    .filter(
      (position) => position.contract.secType === 'OPT' && position.pos < 0
    )
    .map((position) => {
      const expiration_date = dayjs(
        position.contract.lastTradeDateOrContractMonth,
        'YYYYMMDD'
      )
      const days_remaining = expiration_date.diff(dayjs(), 'day')
      return {
        name: `${position.contract.symbol} ${position.contract.right} ${position.contract.strike} ${position.contract.lastTradeDateOrContractMonth}`,
        amount: Math.abs(
          position.contract.strike * position.pos * position.contract.multiplier
        ),
        days: days_remaining
      }
    })

  // Update probability-based liabilities calculation
  for (const threshold of probability_thresholds) {
    liability_by_probability[
      `total_liability_greater_than_${threshold * 100}pct_prob`
    ] = positions_with_market_data
      .filter((position) => {
        const delta = position.market_data.delta
        if (!delta) return false
        return position.contract.right === 'P'
          ? 1 - Math.abs(delta) >= threshold // Put option
          : Math.abs(delta) >= threshold // Call option
      })
      .reduce((acc, position) => {
        const stock_position = stock_positions.get(position.contract.symbol)
        const shares_held = stock_position ? stock_position.pos : 0
        const contracts = Math.abs(position.pos)
        const shares_needed = contracts * position.contract.multiplier

        if (position.contract.right === 'C' && shares_held >= shares_needed) {
          // Call is fully covered by shares, no liability
          return acc
        } else if (position.contract.right === 'C' && shares_held > 0) {
          // Call is partially covered, calculate remaining liability
          const uncovered_contracts =
            (shares_needed - shares_held) / position.contract.multiplier
          return (
            acc +
            position.contract.strike *
              uncovered_contracts *
              position.contract.multiplier
          )
        } else {
          // Put or uncovered call
          return (
            acc +
            position.contract.strike * contracts * position.contract.multiplier
          )
        }
      }, 0)
  }

  result.liability_by_probability = liability_by_probability

  ib.disconnect()

  if (!keep_alive) {
    const res_stop_status = await stop_docker_container({
      host,
      port: docker_port,
      id: container.Id
    })
    log(`docker container stopped (status: ${res_stop_status})`)
  }

  return result
}
