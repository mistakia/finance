import fetch from 'node-fetch'
import dayjs from 'dayjs'
import debug from 'debug'
import { IBApiNext, EventName } from '@stoqey/ib'

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

  const result = {}
  for (const tag of account_summary_tags) {
    const item = account_summary.get(tag)
    if (item) {
      result[tag] = Number(item.get('USD').value)
    }
  }

  result.option_cash_liability = Math.abs(
    account_positions
      .filter(
        (position) => position.contract.secType === 'OPT' && position.pos < 0
      )
      .reduce((acc, position) => {
        const cost =
          position.contract.strike * position.pos * position.contract.multiplier
        return acc + cost
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
