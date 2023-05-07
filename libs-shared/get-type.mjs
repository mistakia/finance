import { getInstrument } from './robinhood.mjs'

export default async function ({ symbol }) {
  const instrument = await getInstrument({ symbol })

  if (!instrument) {
    return null
  }

  return `${instrument.country.toLowerCase()}-${instrument.type}`
}
