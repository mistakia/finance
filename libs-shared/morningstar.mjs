import fetch from 'node-fetch'

import config from '#config'
import { getPage } from './puppeteer.mjs'

const data_headers = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.84 Safari/537.36',
  referer: 'https://www.morningstar.com/',
  apiKey: config.morningstar.data_api_key
}

export async function search({ symbol }) {
  try {
    // Launch browser and navigate to Morningstar homepage
    const { page, browser } = await getPage('https://www.morningstar.com/')

    // Wait a few seconds to establish cookies and pass verification
    await page.waitForTimeout(30000)

    // Make the request using the page's fetch API to leverage browser cookies
    const url = `https://www.morningstar.com/api/v2/search?query=${symbol}`
    const result = await page.evaluate(async (requestUrl) => {
      const response = await fetch(requestUrl)
      return await response.json()
    }, url)

    // Close the browser
    await browser.close()

    // Check for US securities first
    if (result?.components?.usSecurities?.payload?.results?.length) {
      return result.components.usSecurities.payload.results[0]
    }

    // If no US securities, check foreign securities
    if (result?.components?.foreignSecurities?.payload?.results?.length) {
      return result.components.foreignSecurities.payload.results[0]
    }

    return null
  } catch (error) {
    console.error('Error in search:', error)
    return null
  }
}

export async function getSecurityQuote({ secId }) {
  const url = `https://api-global.morningstar.com/sal-service/v1/etf/quote/v1/${secId}/data?benchmarkId=category`
  const options = { headers: data_headers }
  const data = await fetch(url, options).then((res) => res.json())
  return data
}
