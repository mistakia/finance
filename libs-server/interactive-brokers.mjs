import fetch from 'node-fetch'
import debug from 'debug'
import ibkr, { AccountSummary, Portfolios, IBKRConnection } from '@stoqey/ibkr'

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

export const get_account_info = async ({
  host,
  docker_port = 2375,
  ibkr_port = 4002
}) => {
  const containers = await get_docker_containers({ host, port: docker_port })
  const container = containers.find(
    (container) => container.Image === 'manhinhang/ib-gateway-docker'
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

  await ibkr.default({ port: ibkr_port, host })
  log('ibkr connected')

  const { accountSummary } = AccountSummary.Instance
  const portfolios = Portfolios.Instance
  const accountPortfolios = await portfolios.getPortfolios()

  IBKRConnection.Instance.disconnectIBKR()
  const res_stop_status = await stop_docker_container({
    host,
    port: docker_port,
    id: container.Id
  })
  log(`docker container stopped (status: ${res_stop_status})`)

  return {
    container,
    accountSummary,
    accountPortfolios
  }
}
