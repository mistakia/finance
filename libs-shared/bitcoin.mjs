import fetch from 'node-fetch'
import BigNumber from 'bignumber.js'

export const getBalance = async ({ address }) => {
  const url = `https://blockchain.info/rawaddr/${address}`
  const res = await fetch(url)
  const json = await res.json()
  if (json && json.final_balance) {
    return json.final_balance
  }

  return null
}

export const getTransactions = async ({ address }) => {
  const all_txs = []
  let offset = 0
  const limit = 50

  while (true) {
    const url = `https://blockchain.info/rawaddr/${address}?offset=${offset}&limit=${limit}`
    const res = await fetch(url)
    const json = await res.json()
    if (!json || !json.txs || !json.txs.length) break
    all_txs.push(...json.txs)
    if (json.txs.length < limit) break
    offset += limit
  }

  return all_txs
}

export const convertSatsToBtc = (input) =>
  BigNumber(input).shiftedBy(-8).toFixed(8, 1)
