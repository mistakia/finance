import debug from 'debug'
import { isMain, wait } from '#libs-shared'
import import_historical_prices_yahoo from './import-historical-prices-yahoo.mjs'
import calculate_equity_metrics from './calculate-equity-metrics.mjs'

debug.enable('import-historical-prices')
const log = debug(
  'import-historical-prices,import-historical-prices-yahoo,calculate-equity-metrics'
)

const symbols = [
  { symbol: 'AAPL', start_year: 1980 },
  { symbol: 'ABNB', start_year: 2020 },
  { symbol: 'AMZN', start_year: 1997 },
  { symbol: 'ARKK', start_year: 2014 },
  { symbol: 'BND', start_year: 2007 },
  { symbol: 'COIN', start_year: 2021 },
  { symbol: 'DDOG', start_year: 2019 },
  { symbol: 'DELL', start_year: 2016 },
  { symbol: 'DKNG', start_year: 2020 },
  { symbol: 'FDN', start_year: 2006 },
  { symbol: 'GOOGL', start_year: 2004 },
  { symbol: 'ICLN', start_year: 2008 },
  { symbol: 'IEF', start_year: 2002 },
  { symbol: 'IGM', start_year: 2001 },
  { symbol: 'IWM', start_year: 2000 },
  { symbol: 'IYW', start_year: 2000 },
  { symbol: 'KO', start_year: 1985 },
  { symbol: 'LRND', start_year: 2021 },
  { symbol: 'MSFT', start_year: 1986 },
  { symbol: 'NET', start_year: 2019 },
  { symbol: 'NVDA', start_year: 1999 },
  { symbol: 'QLD', start_year: 2006 },
  { symbol: 'QQQ', start_year: 1999 },
  { symbol: 'SHOP', start_year: 2015 },
  { symbol: 'SKYY', start_year: 2011 },
  { symbol: 'SMCI', start_year: 2007 },
  { symbol: 'SNOW', start_year: 2020 },
  { symbol: 'SNPS', start_year: 1992 },
  { symbol: 'SOXL', start_year: 2010 },
  { symbol: 'SPY', start_year: 1993 },
  { symbol: 'TLT', start_year: 2002 },
  { symbol: 'TMF', start_year: 2009 },
  { symbol: 'TQQQ', start_year: 2010 },
  { symbol: 'VGT', start_year: 2004 },
  { symbol: 'XLC', start_year: 2018 },
  { symbol: 'XLE', start_year: 1998 },
  { symbol: 'XLK', start_year: 1998 },
  { symbol: 'XLU', start_year: 1998 }
]

const import_historical_prices = async () => {
  for (const { symbol, start_year } of symbols) {
    try {
      log(`Processing ${symbol} starting from ${start_year}`)
      await import_historical_prices_yahoo({ symbol, startYear: start_year })
      await calculate_equity_metrics({ symbol })
      await wait(10000) // Wait 10 seconds between each symbol to avoid rate limits
    } catch (err) {
      log(`Error processing ${symbol}:`, err)
    }
  }
}

const main = async () => {
  let error
  try {
    await import_historical_prices()
  } catch (err) {
    error = err
    console.log(error)
  }

  /* await db('jobs').insert({
   *   type: constants.jobs.EXAMPLE,
   *   succ: error ? 0 : 1,
   *   reason: error ? error.message : null,
   *   timestamp: Math.round(Date.now() / 1000)
   * })
   */
  process.exit()
}

if (isMain(import.meta.url)) {
  main()
}

export default import_historical_prices
