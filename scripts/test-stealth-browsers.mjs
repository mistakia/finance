import debug from 'debug'

const log = debug('test-stealth')
debug.enable('test-stealth')

const CHASE_URLS = [
  'https://secure07a.chase.com/web/auth/dashboard',
  'https://www.chase.com/'
]

const test_cloakbrowser = async () => {
  log('--- Testing CloakBrowser (Stealth Chromium) ---')
  const { launch } = await import('cloakbrowser')

  const browser = await launch({ headless: false })
  const page = await browser.newPage()

  for (const url of CHASE_URLS) {
    log(`Navigating to: ${url}`)
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
    } catch {
      log('Navigation timeout (may still have loaded)')
    }

    await new Promise((r) => setTimeout(r, 5000))

    const current_url = page.url()
    const title = await page.title()
    log(`  URL: ${current_url}`)
    log(`  Title: ${title}`)

    const is_blocked = current_url.includes('system-requirements')
    const has_login = await page.locator('#userId-text-input-field').count().catch(() => 0)
    const is_authed =
      current_url.includes('/web/auth/dashboard') ||
      current_url.includes('/account/activity')

    log(`  Blocked (system-requirements): ${is_blocked}`)
    log(`  Login form visible: ${has_login > 0}`)
    log(`  Authenticated: ${is_authed}`)

    if (!is_blocked && (has_login > 0 || is_authed)) {
      log('  RESULT: PASS - Chase SPA rendered successfully')
      await browser.close()
      return { tool: 'CloakBrowser', passed: true, url: current_url }
    }
  }

  log('  RESULT: FAIL - Could not reach Chase login')
  await browser.close()
  return { tool: 'CloakBrowser', passed: false }
}

const test_cloakbrowser_persistent = async () => {
  log('--- Testing CloakBrowser Persistent Context ---')
  const { launchPersistentContext } = await import('cloakbrowser')
  const os = await import('os')
  const path = await import('path')

  const profile_dir = path.default.join(os.default.homedir(), '.chase-cloakbrowser-profile')
  const context = await launchPersistentContext({ userDataDir: profile_dir, headless: false })
  const page = await context.newPage()

  for (const url of CHASE_URLS) {
    log(`Navigating to: ${url}`)
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
    } catch {
      log('Navigation timeout (may still have loaded)')
    }

    await new Promise((r) => setTimeout(r, 5000))

    const current_url = page.url()
    const title = await page.title()
    log(`  URL: ${current_url}`)
    log(`  Title: ${title}`)

    const is_blocked = current_url.includes('system-requirements')
    const has_login = await page.locator('#userId-text-input-field').count().catch(() => 0)
    const is_authed =
      current_url.includes('/web/auth/dashboard') ||
      current_url.includes('/account/activity')

    log(`  Blocked (system-requirements): ${is_blocked}`)
    log(`  Login form visible: ${has_login > 0}`)
    log(`  Authenticated: ${is_authed}`)

    if (!is_blocked && (has_login > 0 || is_authed)) {
      log('  RESULT: PASS - Chase SPA rendered successfully with persistent context')
      await context.close()
      return { tool: 'CloakBrowser-persistent', passed: true, url: current_url }
    }
  }

  log('  RESULT: FAIL - Could not reach Chase login')
  await context.close()
  return { tool: 'CloakBrowser-persistent', passed: false }
}

const test_camoufox = async () => {
  log('--- Testing Camoufox (Stealth Firefox) ---')
  const { Camoufox } = await import('camoufox-js')

  const browser = await Camoufox({ headless: false })
  const page = await browser.newPage()

  for (const url of CHASE_URLS) {
    log(`Navigating to: ${url}`)
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
    } catch {
      log('Navigation timeout (may still have loaded)')
    }

    await new Promise((r) => setTimeout(r, 5000))

    const current_url = page.url()
    const title = await page.title()
    log(`  URL: ${current_url}`)
    log(`  Title: ${title}`)

    const is_blocked = current_url.includes('system-requirements')
    const has_login = await page.locator('#userId-text-input-field').count().catch(() => 0)
    const is_authed =
      current_url.includes('/web/auth/dashboard') ||
      current_url.includes('/account/activity')

    log(`  Blocked (system-requirements): ${is_blocked}`)
    log(`  Login form visible: ${has_login > 0}`)
    log(`  Authenticated: ${is_authed}`)

    if (!is_blocked && (has_login > 0 || is_authed)) {
      log('  RESULT: PASS - Chase SPA rendered successfully')
      await browser.close()
      return { tool: 'Camoufox', passed: true, url: current_url }
    }
  }

  log('  RESULT: FAIL - Could not reach Chase login')
  await browser.close()
  return { tool: 'Camoufox', passed: false }
}

const main = async () => {
  const args = process.argv.slice(2)
  const test_name = args[0] || 'all'

  const tests = {
    cloakbrowser: test_cloakbrowser,
    'cloakbrowser-persistent': test_cloakbrowser_persistent,
    camoufox: test_camoufox
  }

  const results = []

  if (test_name === 'all') {
    for (const [name, test_fn] of Object.entries(tests)) {
      try {
        const result = await test_fn()
        results.push(result)
      } catch (err) {
        log(`${name} ERROR: ${err.message}`)
        results.push({ tool: name, passed: false, error: err.message })
      }
    }
  } else if (tests[test_name]) {
    try {
      const result = await tests[test_name]()
      results.push(result)
    } catch (err) {
      log(`${test_name} ERROR: ${err.message}`)
      results.push({ tool: test_name, passed: false, error: err.message })
    }
  } else {
    console.error(`Unknown test: ${test_name}`)
    console.error(`Available: ${Object.keys(tests).join(', ')}, all`)
    process.exit(1)
  }

  log('\n--- RESULTS ---')
  for (const r of results) {
    log(`  ${r.tool}: ${r.passed ? 'PASS' : 'FAIL'}${r.error ? ` (${r.error})` : ''}`)
  }

  process.exit(0)
}

main()
