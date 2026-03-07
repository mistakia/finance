import fetch from 'node-fetch'
import BigNumber from 'bignumber.js'
import config from '#config'

const getBaseUrl = () =>
  `https://mainnet.helius-rpc.com/?api-key=${config.helius_api}`

const getEnhancedUrl = () =>
  `https://api.helius.xyz/v0`

const rpcRequest = async ({ method, params = [] }) => {
  const response = await fetch(getBaseUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params
    })
  })

  const data = await response.json()
  if (data.error) {
    throw new Error(`Solana RPC error: ${data.error.message}`)
  }
  return data.result
}

export const convertLamportsToSol = (lamports) => {
  return BigNumber(lamports).shiftedBy(-9).toNumber()
}

export const getBalance = async ({ address }) => {
  const result = await rpcRequest({
    method: 'getBalance',
    params: [address]
  })
  return result.value
}

export const getTokenBalances = async ({ address }) => {
  const all_assets = []
  let page = 1

  while (true) {
    const result = await rpcRequest({
      method: 'getAssetsByOwner',
      params: [
        {
          ownerAddress: address,
          page,
          displayOptions: { showFungible: true, showNativeBalance: true }
        }
      ]
    })

    const items = result?.items || []
    if (items.length === 0) break
    all_assets.push(...items)

    if (result.total <= all_assets.length) break
    page++
  }

  return all_assets
}

export const getTransactions = async ({ address, type }) => {
  const all_transactions = []
  let before_signature = undefined

  while (true) {
    let url = `${getEnhancedUrl()}/addresses/${address}/transactions?api-key=${config.helius_api}`
    if (type) url += `&type=${type}`
    if (before_signature) url += `&before=${before_signature}`

    const response = await fetch(url)
    const data = await response.json()

    if (!Array.isArray(data) || data.length === 0) break
    all_transactions.push(...data)
    if (data.length < 100) break
    before_signature = data[data.length - 1].signature
  }

  return all_transactions
}

export const getStakeAccounts = async ({ address }) => {
  const result = await rpcRequest({
    method: 'getProgramAccounts',
    params: [
      'Stake11111111111111111111111111111111111111',
      {
        encoding: 'jsonParsed',
        filters: [
          { memcmp: { offset: 44, bytes: address } }
        ]
      }
    ]
  })

  return result || []
}

export const getStakingRewards = async ({
  stakeAccount,
  startEpoch,
  endEpoch
}) => {
  const rewards = []

  for (let epoch = startEpoch; epoch <= endEpoch; epoch++) {
    const result = await rpcRequest({
      method: 'getInflationReward',
      params: [[stakeAccount], { epoch }]
    })

    if (result && result[0]) {
      rewards.push({
        epoch,
        ...result[0]
      })
    }
  }

  return rewards
}
