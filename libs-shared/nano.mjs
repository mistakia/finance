import fetch from 'node-fetch'
import BigNumber from 'bignumber.js'

export const getBalance = async ({ address }) => {
  const url = `https://nano.community/api/accounts/${address}`
  const res = await fetch(url)
  const data = await res.json()
  return data
}

export const getTransactions = async ({ address }) => {
  const all_history = []
  let head = null

  while (true) {
    const body = {
      action: 'account_history',
      account: address,
      count: 100,
      ...(head ? { head } : {})
    }
    const res = await fetch('https://nano.community/api/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const json = await res.json()
    if (!json || !json.history || !json.history.length) break
    all_history.push(...json.history)
    if (json.history.length < 100) break
    head = json.history[json.history.length - 1].hash
  }

  return all_history
}

export const convertRawToNano = (input) =>
  BigNumber(input).shiftedBy(-30).toFixed(30, 1)
