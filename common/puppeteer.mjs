import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import AnonymizeUaPlugin from 'puppeteer-extra-plugin-anonymize-ua'
import randomUseragent from 'random-useragent'

puppeteer.use(StealthPlugin())
puppeteer.use(AnonymizeUaPlugin())

export const getPage = async (url) => {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-infobars',
    '--window-position=0,0',
    '--ignore-certifcate-errors',
    '--ignore-certifcate-errors-spki-list',
    '--user-agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.64 Safari/537.36"'
  ]
  const browser = await puppeteer.launch({
    headless: false,
    args,
    timeout: 0, // 90000,
    ignoreDefaultArgs: ['--enable-automation']
  })

  const page = await browser.newPage()

  // Randomize viewport size
  await page.setViewport({
    width: 1300 + Math.floor(Math.random() * 100),
    height: 500 + Math.floor(Math.random() * 100),
    deviceScaleFactor: 1,
    hasTouch: false,
    isLandscape: false,
    isMobile: false
  })

  await page.setUserAgent(randomUseragent.getRandom())
  await page.setJavaScriptEnabled(true)
  await page.setDefaultNavigationTimeout(0)

  // Skip images/styles/fonts loading for performance
  /* await page.setRequestInterception(true)
   * page.on('request', (req) => {
   *   if (
   *     req.resourceType() == 'stylesheet' ||
   *     req.resourceType() == 'font' ||
   *     req.resourceType() == 'image'
   *   ) {
   *     req.abort()
   *   } else {
   *     req.continue()
   *   }
   * })
   */
  await page.evaluateOnNewDocument(() => {
    // Pass webdriver check
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false
    })
  })

  await page.evaluateOnNewDocument(() => {
    // Pass chrome check
    window.chrome = {
      runtime: {}
      // etc.
    }
  })

  await page.evaluateOnNewDocument(() => {
    // Pass notifications check
    const originalQuery = window.navigator.permissions.query
    return (window.navigator.permissions.query = (parameters) =>
      parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : originalQuery(parameters))
  })

  await page.evaluateOnNewDocument(() => {
    // Overwrite the `plugins` property to use a custom getter.
    Object.defineProperty(navigator, 'plugins', {
      // This just needs to have `length > 0` for the current test,
      // but we could mock the plugins too if necessary.
      get: () => [1, 2, 3, 4, 5]
    })
  })

  await page.evaluateOnNewDocument(() => {
    // Overwrite the `languages` property to use a custom getter.
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en']
    })
  })

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 0 })

  return { page, browser }
}
