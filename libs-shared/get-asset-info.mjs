import { coingecko, morningstar, slugify, alphavantage } from '#libs-shared'

export default async function ({ type, symbol }) {
  // TODO - if type missing, get type

  const info = {
    type,
    symbol,
    link: `/${type}/${symbol}`
  }

  switch (type) {
    // case 'us-etf': all ETFs are ETPs
    case 'us-fund':
    case 'us-etp':
    case 'us-reit':
    case 'cn-adr':
    case 'us-stock': {
      const security = await morningstar.search({ symbol })
      if (!security) {
        throw new Error(`unsupported us security: ${symbol}`)
      }

      const morningstar_quote = await morningstar.getSecurityQuote({
        secId: security.securityID
      })
      const alphavantage_quote = await alphavantage.getQuote({ symbol })
      const category = morningstar_quote.categoryName
        ? slugify(morningstar_quote.categoryName)
        : 'unclassified'

      return {
        ...info,
        market_value_usd: alphavantage_quote['Global Quote']['05. price'],
        asset_class: `/public-equity/${category}`
      }
    }

    case 'crypto': {
      const coin = await coingecko.getCoin({ symbol })
      if (!coin) {
        throw new Error(`unsupported crypto currency: ${symbol}`)
      }

      const isToken = Boolean(coin.asset_platform_id)
      const asset_class = isToken
        ? '/crypto-currency/token'
        : '/crypto-currency/native'

      return {
        ...info,
        asset_class,
        market_value_usd: coin.market_data.current_price.usd
      }
    }

    case 'currency': {
      const exchangeInfo = await alphavantage.getExchangeRate({ symbol })

      return {
        ...info,
        market_value_usd: exchangeInfo.rate,
        asset_class: '/currency'
      }
    }

    case 'us-property': {
      // TODO
      return {
        ...info,
        asset_class: '/parcel'
      }
    }

    case 'loan-crypto': {
      const coin = await coingecko.getCoin({ symbol })
      if (!coin) {
        throw new Error(`unsupported crypto currency: ${symbol}`)
      }

      return {
        ...info,
        market_value_usd: coin.market_data.current_price.usd,
        asset_class: '/crypto-currency'
      }
    }

    case 'loan-mortgage': {
      return {
        ...info,
        market_value_usd: 1,
        asset_class: '/parcel'
      }
    }

    case 'loan-note': {
      return {
        ...info,
        market_value_usd: 1,
        asset_class: '/misc'
      }
    }

    default: {
      throw new Error(`unknown asset type: ${type}`)
    }
  }
}
