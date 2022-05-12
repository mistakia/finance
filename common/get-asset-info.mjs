import { coingecko, morningstar, slugify, alphavantage } from '#common'

export default async function ({ type, symbol }) {
  // TODO - if type missing, get type

  const info = {
    type,
    symbol,
    link: `/${type}/${symbol}`
  }

  switch (type) {
    case 'us-fund':
    case 'us-etf':
    case 'us-etp':
    case 'us-reit':
    case 'us-stock': {
      const security = await morningstar.searchSecurity({ symbol })
      if (!security) {
        throw new Error('unsupported us security')
      }

      const morningstar_quote = await morningstar.getSecurityQuote({
        secId: security.secId
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
        throw new Error('unsupported crypto currency')
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

    case 'us-property': {
      // TODO
      return {
        ...info,
        asset_class: '/parcel/'
      }
    }

    default: {
      throw new Error('unknown asset type')
    }
  }
}
