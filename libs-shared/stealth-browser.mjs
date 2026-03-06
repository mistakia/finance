import debug from 'debug'
import { launch, launchPersistentContext } from 'cloakbrowser'

const log = debug('stealth-browser')

export const launch_browser = async ({ headless = false } = {}) => {
  log('launching stealth browser (headless: %s)', headless)
  const browser = await launch({ headless })
  return browser
}

export const launch_persistent_context = async ({
  user_data_dir,
  headless = false
} = {}) => {
  if (!user_data_dir) {
    throw new Error('user_data_dir is required for persistent context')
  }

  log('launching persistent context (profile: %s, headless: %s)', user_data_dir, headless)

  const context = await launchPersistentContext({
    userDataDir: user_data_dir,
    headless
  })

  return context
}

export const create_page = async (browser_or_context) => {
  const page = await browser_or_context.newPage()
  page.setDefaultNavigationTimeout(60000)
  page.setDefaultTimeout(30000)
  return page
}

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
