import { coingecko, morningstar, slugify, alphavantage } from '#libs-shared'

export default async function ({ asset_type, symbol }) {
  // TODO - if type missing, get type

  const info = {
    asset_type,
    symbol,
    link: `/${asset_type}/${symbol}`
  }

  switch (asset_type) {
    // case 'us_etf': all ETFs are ETPs
    case 'us_fund':
    case 'us_etp':
    case 'us_reit':
    case 'cn_adr':
    case 'us_stock': {
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
        asset_class: `/public_equity/${category}`
      }
    }

    case 'crypto': {
      const coin = await coingecko.getCoin({ symbol })
      if (!coin) {
        throw new Error(`unsupported crypto currency: ${symbol}`)
      }

      const isToken = Boolean(coin.asset_platform_id)
      const asset_class = isToken
        ? '/crypto_currency/token'
        : '/crypto_currency/native'

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

    case 'us_property': {
      // TODO
      return {
        ...info,
        asset_class: '/parcel'
      }
    }

    case 'loan_crypto': {
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

    case 'loan_mortgage': {
      return {
        ...info,
        market_value_usd: 1,
        asset_class: '/parcel'
      }
    }

    case 'loan_note': {
      return {
        ...info,
        market_value_usd: 1,
        asset_class: '/misc'
      }
    }

    default: {
      throw new Error(`unknown asset type: ${asset_type}`)
    }
  }
}
