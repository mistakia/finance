import debug from 'debug'
import os from 'os'
import path from 'path'

import { getPage } from './puppeteer.mjs'

const log = debug('fidelity')

const FIDELITY_USER_DATA_DIR = path.join(
  os.homedir(),
  '.fidelity-puppeteer-profile'
)

const is_authenticated = async (page) => {
  try {
    const url = new URL(page.url())
    const pathname = url.pathname
    return (
      pathname.includes('/digital/portfolio') ||
      pathname.includes('/ftgw/digital/portfolio') ||
      pathname.includes('/digital/home')
    )
  } catch (_) {
    return false
  }
}

const login = async ({ username, password }) => {
  log('Starting login')
  const { page, browser } = await getPage(
    'https://digital.fidelity.com/ftgw/digital/portfolio/summary',
    { user_data_dir: FIDELITY_USER_DATA_DIR }
  )
  log(`Got page and browser, navigated to: ${page.url()}`)

  try {
    // Check if already authenticated (persistent session from profile)
    if (await is_authenticated(page)) {
      log('Already authenticated via persistent session')
      return { page, browser }
    }

    // Not authenticated, navigate to login page
    await page.goto(
      'https://digital.fidelity.com/prgw/digital/login/full-page?AuthRedUrl=digital.fidelity.com/ftgw/digital/portfolio/summary'
    )
    log('Navigated to login page')

    // Wait for login form elements to be present
    await page.waitForSelector('#dom-username-input', { timeout: 30000 })
    await page.waitForSelector('#dom-pswd-input', { timeout: 30000 })
    await page.waitForSelector('#dom-login-button', { timeout: 30000 })
    log('Login page elements loaded')

    // Enter credentials and submit
    await page.type('#dom-username-input', username)
    log('Entered username')
    await page.type('#dom-pswd-input', password)
    log('Entered password')
    await page.click('#dom-login-button')
    log('Clicked login button')

    await new Promise((resolve) => setTimeout(resolve, 5000))

    // Check for rate limiting or errors
    const body_text = await page.evaluate(() => document.body.innerText)
    if (
      body_text.includes("Sorry, we can't complete this action") ||
      body_text.includes('try again')
    ) {
      throw new Error(
        'Fidelity login temporarily blocked. Wait a few minutes and try again.'
      )
    }

    // Handle 2FA if required
    if (body_text.includes('notification to the Fidelity Investments app')) {
      log('Security verification required')
      const send_button = await page.$('#dom-push-primary-button')
      if (send_button) {
        await send_button.click()
        log('Clicked send notification button')
      }
      log('Waiting for 2FA approval...')
      await page.waitForNavigation({ timeout: 120000 })
      log('2FA approved, continuing')
    }

    // Wait for portfolio page to load
    await page.waitForFunction(
      'document.URL.includes("/digital/portfolio") || document.URL.includes("/digital/home")',
      { timeout: 60000 }
    )
    log('Portfolio page loaded')

    return { page, browser }
  } catch (error) {
    await browser.close()
    throw error
  }
}

export const get_accounts = async ({ username, password }) => {
  const { page, browser } = await login({ username, password })

  try {
    // navigate to positions page
    await page.goto(
      'https://digital.fidelity.com/ftgw/digital/portfolio/positions'
    )
    log('Navigated to positions page')

    // Wait for accounts data to load
    await page.waitForSelector('.ag-cell, .posweb-cell', { timeout: 60000 })
    log('Account data loaded')

    // Extract positions data
    const positions = await page.evaluate(() => {
      // Get all rows that contain position data from both containers
      const left_pinned_rows = Array.from(
        document.querySelectorAll(
          '.ag-pinned-left-cols-container .ag-row:not(.posweb-row-account_total):not(.posweb-row-grand_total)'
        )
      )
      const center_rows = Array.from(
        document.querySelectorAll(
          '.ag-center-cols-viewport .ag-row:not(.posweb-row-account_total):not(.posweb-row-grand_total)'
        )
      )

      // Create a map to match rows by their row ID
      const position_data = []
      let current_account = null

      // Process each row pair
      for (let i = 0; i < left_pinned_rows.length; i++) {
        const left_row = left_pinned_rows[i]
        const center_row = center_rows[i] // Matching center row should be at the same index

        if (!left_row || !center_row) continue

        // Check if this is an account row
        const is_account_row = left_row.classList.contains('posweb-row-account')
        if (is_account_row) {
          // Extract account information
          const account_name_element = left_row.querySelector(
            '.posweb-cell-account_primary'
          )
          const account_number_element = left_row.querySelector(
            '.posweb-cell-account_secondary'
          )

          if (account_name_element && account_number_element) {
            const account_name = account_name_element.textContent.trim()
            const account_number = account_number_element.textContent.trim()

            current_account = {
              name: account_name,
              account_number
            }
          }
          continue // Skip processing this row as a position
        }

        // Verify rows match by checking row ID
        const left_row_id = left_row.getAttribute('row-id')
        const center_row_id = center_row.getAttribute('row-id')

        if (
          left_row_id !== center_row_id &&
          left_row_id !== null &&
          center_row_id !== null
        ) {
          console.log(`Row mismatch: ${left_row_id} vs ${center_row_id}`)
          continue // Skip if rows don't match
        }

        // Extract symbol from left container
        const symbol_cell = left_row.querySelector(
          '.posweb-cell-symbol-name_container span'
        )
        const symbol = symbol_cell ? symbol_cell.textContent.trim() : ''

        // Extract description/name from left container
        const description_cell = left_row.querySelector(
          '.posweb-cell-symbol-description'
        )
        const name = description_cell ? description_cell.textContent.trim() : ''

        // Extract expiration date for options
        let expiration = null
        if (
          description_cell &&
          description_cell.textContent.trim().match(/\w+-\d+-\d+/)
        ) {
          expiration = description_cell.textContent.trim()
        }

        // Extract quantity from center container - using col-id attribute
        const quantity_cell = center_row.querySelector('[col-id="qty"]')
        let quantity = 0
        if (quantity_cell) {
          const quantity_text = quantity_cell.textContent.trim()
          quantity = parseFloat(quantity_text.replace(/[,$]/g, ''))
        }

        // Extract price from center container - using col-id attribute
        const price_cell = center_row.querySelector('[col-id="lstPrStk"]')
        let price = 0
        if (price_cell) {
          const price_text = price_cell.textContent.trim()
          price = parseFloat(price_text.replace(/[,$]/g, '').replace(/^\$/, ''))
        }

        // Extract value from center container - using col-id attribute
        const value_cell = center_row.querySelector('[col-id="curVal"]')
        let value = 0
        if (value_cell) {
          const value_text = value_cell.textContent.trim()
          // Handle negative values (like for short positions)
          value = parseFloat(value_text.replace(/[,$]/g, '').replace(/^\$/, ''))
          // Preserve negative sign for short positions
          if (value_text.trim().startsWith('-')) {
            value = -value
          }
        }

        // Extract cost basis from center container - using col-id attribute
        const cost_basis_cell = center_row.querySelector('[col-id="cstBasStk"]')
        let cost_basis = 0
        if (cost_basis_cell) {
          const cost_basis_text = cost_basis_cell.textContent.trim()
          cost_basis = parseFloat(
            cost_basis_text.replace(/[,$]/g, '').replace(/^\$/, '')
          )
        }

        // Determine if it's an option
        const is_option =
          symbol.includes(' ') ||
          (name && name.toLowerCase().includes('option')) ||
          symbol.includes('Call') ||
          symbol.includes('Put')

        // For cash positions
        const is_money_market =
          symbol === 'Cash' || name.includes('MONEY MARKET')

        // Parse option details if it's an option
        let option_details = null
        if (is_option) {
          // Check if symbol contains "Put" or "Call"
          const is_put = symbol.includes('Put')
          const is_call = symbol.includes('Call')

          // Extract strike price from symbol if possible
          let strike = 0
          const strike_match = symbol.match(/(\d+(?:\.\d+)?)\s+(Put|Call)/)
          if (strike_match) {
            strike = parseFloat(strike_match[1])
          }

          let formatted_expiration = null
          if (expiration) {
            formatted_expiration = expiration.replace(
              /(\w+)-(\d+)-(\d+)/,
              (_, month, day, year) => {
                const months = {
                  Jan: '01',
                  Feb: '02',
                  Mar: '03',
                  Apr: '04',
                  May: '05',
                  Jun: '06',
                  Jul: '07',
                  Aug: '08',
                  Sep: '09',
                  Oct: '10',
                  Nov: '11',
                  Dec: '12'
                }
                return `${year}-${months[month]}-${day.padStart(2, '0')}`
              }
            )
          }
          option_details = {
            underlying: symbol.split(' ')[0],
            strike,
            expiration: formatted_expiration,
            put_call: is_put ? 'PUT' : is_call ? 'CALL' : null,
            contracts: Math.abs(quantity)
          }

          // Calculate liability for short options
          if (quantity < 0) {
            option_details.liability =
              option_details.strike * Math.abs(quantity) * 100
          }
        }

        position_data.push({
          symbol,
          name,
          quantity: isNaN(quantity) ? 0 : quantity,
          price: isNaN(price) ? 0 : price,
          value: isNaN(value) ? 0 : value,
          cost_basis: isNaN(cost_basis) ? 0 : cost_basis,
          type: is_money_market
            ? 'money_market'
            : is_option
            ? 'option'
            : 'stock',
          account: current_account ? { ...current_account } : null,
          option_details: is_option ? option_details : null
        })
      }

      return position_data.filter(
        (position) => position.symbol && position.symbol !== 'Account Total'
      )
    })

    log('Extracted positions data')
    // Extract account information more reliably
    const accounts = await page.evaluate(() => {
      const account_names = Array.from(
        document.querySelectorAll('.posweb-cell-account_primary')
      ).map((el) => el.textContent.trim())
      const account_numbers = Array.from(
        document.querySelectorAll('.posweb-cell-account_secondary')
      ).map((el) => el.textContent.trim())

      // Get account totals from the "Account Total" rows
      const account_total_rows = Array.from(
        document.querySelectorAll('.posweb-row-total')
      )
      const account_totals = account_total_rows.map((row) => {
        // Get the row ID to find the matching center row
        const row_id = row.getAttribute('row-id')
        // Find the matching center row with the same row-id
        const center_row = document.querySelector(
          `.ag-center-cols-container .ag-row[row-id="${row_id}"]`
        )

        if (center_row) {
          const value_cell = center_row.querySelector('[col-id="curVal"]')
          if (value_cell) {
            return (
              parseFloat(
                value_cell.textContent.replace(/[,$]/g, '').replace(/^\$/, '')
              ) || 0
            )
          }
        }
        return 0
      })

      // Create account objects
      return account_names.map((name, index) => {
        const account_number = account_numbers[index] || ''
        // Determine account type based on name
        let type = 'investment'
        if (
          name.toLowerCase().includes('401k') ||
          name.toLowerCase().includes('retirement') ||
          name.toLowerCase().includes('ira') ||
          name.toLowerCase().includes('roth')
        ) {
          type = 'retirement'
        }

        return {
          name,
          account_number,
          type,
          balance: account_totals[index] || 0
        }
      })
    })

    log('Extracted basic account information')

    // Update account cash balances from positions data
    const accounts_with_cash_balances = accounts.map((account) => {
      // Find cash position for this account
      const money_market_position = positions.find(
        (position) =>
          position.type === 'money_market' &&
          position.account &&
          position.account.account_number === account.account_number
      )

      // Calculate cash balance by subtracting all non-cash positions from account balance
      const account_positions = positions.filter(
        (position) =>
          position.account &&
          position.account.account_number === account.account_number &&
          position.type !== 'money_market'
      )

      // Sum up the value of all non-cash positions
      const total_invested_value = account_positions.reduce((sum, position) => {
        // Only add positive positions (stocks and long options)
        // Filter out short option positions (negative quantity)
        if (
          position.value > 0 &&
          !(position.type === 'option' && position.quantity < 0)
        ) {
          return sum + position.value
        }
        return sum
      }, 0)

      // Cash balance is the total account balance minus invested value
      const calculated_cash_balance = account.balance - total_invested_value

      // Update the account with cash balance if found
      if (money_market_position) {
        return {
          ...account,
          money_market_balance: money_market_position.value,
          cash_balance: calculated_cash_balance
        }
      }

      return {
        ...account,
        cash_balance: calculated_cash_balance
      }
    })

    // Get grand total from the "Grand Total" row
    const grand_total = await page.evaluate(() => {
      const grand_total_row = document.querySelector('.posweb-row-grand_total')
      if (grand_total_row) {
        const row_id = grand_total_row.getAttribute('row-id')
        const center_row = document.querySelector(
          `.ag-center-cols-container .ag-row[row-id="${row_id}"]`
        )

        if (center_row) {
          const value_cell = center_row.querySelector('[col-id="curVal"]')
          if (value_cell) {
            return (
              parseFloat(
                value_cell.textContent.replace(/[,$]/g, '').replace(/^\$/, '')
              ) || 0
            )
          }
        }
      }
      return 0
    })

    log('Extracted grand total balance')

    // // No need for separate option liabilities calculation since it's now included in positions
    const option_liabilities = positions
      .filter((position) => position.type === 'option' && position.quantity < 0)
      .map((position) => {
        return {
          name: position.symbol,
          underlying:
            position.option_details?.underlying ||
            position.symbol.split(' ')[0],
          strike: position.option_details?.strike || 0,
          expiration: position.option_details?.expiration || 'unknown',
          put_call: position.option_details?.put_call || 'UNKNOWN',
          contracts: Math.abs(position.quantity),
          liability:
            position.option_details?.liability || Math.abs(position.value) * 100
        }
      })

    log('Calculated option liabilities')

    // Fetch option data for short positions to get delta values
    const option_positions = positions.filter(
      (position) => position.type === 'option' && position.quantity < 0
    )

    if (option_positions.length > 0) {
      log('Fetching option data for short positions')

      // Create a map to store option data by symbol
      const option_data_map = new Map()

      // Group positions by underlying symbol AND expiration date
      const positions_by_underlying_and_expiration = {}
      option_positions.forEach((position) => {
        if (
          !position.option_details ||
          !position.option_details.underlying ||
          !position.option_details.expiration ||
          position.option_details.expiration === 'unknown'
        )
          return

        const underlying = position.option_details.underlying
        const expiration = position.option_details.expiration

        const key = `${underlying}_${expiration}`
        if (!positions_by_underlying_and_expiration[key]) {
          positions_by_underlying_and_expiration[key] = {
            underlying,
            expiration,
            positions: []
          }
        }
        positions_by_underlying_and_expiration[key].positions.push(position)
      })

      // Process each underlying symbol and expiration combination
      for (const [, group] of Object.entries(
        positions_by_underlying_and_expiration
      )) {
        try {
          const { underlying, expiration } = group
          log(
            `Fetching option chain for ${underlying} with expiration ${expiration}`
          )

          // Format the expiration date for the API (YYYYMMDD)
          const formatted_expiration = expiration.replace(/-/g, '')

          log(`Using expiration filter date: ${formatted_expiration}`)

          // Create a new page using the same browser context to maintain cookies/session
          const option_page = await browser.newPage()

          // Navigate to the option chain page with specific expiration
          const option_chain_url = `https://researchtools.fidelity.com/ftgw/mloptions/goto/optionChain?symbols=${underlying}&calls=Y&puts=Y&VOL_FILTER_TYPE=Show+All+Options&FILTER_DAT=7&expFilterDates_slo=${formatted_expiration}&sortBy=EXDATE_EXTYPE_OPTYPE_ADJ&sortDir=A&sortTable=P&showsymbols=N&showsymbols2=N&showhistogram=Y&showWeekly=Y&optChainSearch=Y&strikeSelected=All&chaintype=std&strategy=CallsPuts`

          log(
            `Navigating to option chain for ${underlying} with expiration ${expiration}, url: ${option_chain_url}`
          )
          await option_page.goto(option_chain_url, {
            waitUntil: 'networkidle0',
            timeout: 60000
          })

          // Wait for the option chain data to load
          await option_page
            .waitForSelector('.symbol-results-data-table', { timeout: 30000 })
            .catch(() =>
              log('Option chain table selector not found, continuing anyway')
            )

          // Extract all option data for this underlying and expiration
          const option_chain_data = await option_page.evaluate((symbol) => {
            const options_data = {}

            // Process all option rows in the table - using the correct selector
            const option_rows = document.querySelectorAll(
              '.symbol-results-data-table tr[id^="N_"]'
            )

            option_rows.forEach((row) => {
              // Extract strike price from the center column
              const strike_cell = row.querySelector('td[name="Strike"]')
              if (!strike_cell) return
              const strike = parseFloat(strike_cell.textContent.trim())

              // Extract expiration date from the row name attribute
              const expiration_text = row.getAttribute('name')
              if (!expiration_text) return

              // Parse and format expiration date from format like "Mar 21 '25 (24 days)"
              const [month, day, year_with_quote] = expiration_text.split(' ')
              const year = `20${year_with_quote.slice(1, 3)}` // Convert '25 to 2025
              const month_num = new Date(`${month} 1, 2000`).getMonth() + 1 // Convert Mar to 3
              const formatted_month = month_num.toString().padStart(2, '0')
              const formatted_day = day.padStart(2, '0')
              const expiration = `${year}-${formatted_month}-${formatted_day}`

              // Extract delta values for both call and put options
              const call_delta_cell = row.querySelector(
                'td[name="Delta Calls"]'
              )
              const put_delta_cell = row.querySelector('td[name="Delta Puts"]')

              if (call_delta_cell) {
                const call_delta = parseFloat(
                  call_delta_cell.textContent.trim()
                )
                if (!isNaN(call_delta)) {
                  const call_key = `${expiration}_${strike}_C`

                  options_data[call_key] = {
                    underlying: symbol,
                    expiration,
                    strike,
                    put_call: 'CALL',
                    delta: call_delta
                  }
                }
              }

              if (put_delta_cell) {
                const put_delta_text = put_delta_cell.textContent.trim()
                // Put deltas are typically negative, ensure we preserve the sign
                const put_delta = parseFloat(put_delta_text)
                if (!isNaN(put_delta)) {
                  const put_key = `${expiration}_${strike}_P`

                  options_data[put_key] = {
                    underlying: symbol,
                    expiration,
                    strike,
                    put_call: 'PUT',
                    delta: put_delta
                  }
                }
              }
            })

            return options_data
          }, underlying)

          await option_page.close()

          // Store the option data in the map
          if (!option_data_map.has(underlying)) {
            option_data_map.set(underlying, {})
          }

          // Merge the new data with any existing data for this underlying
          const existing_data = option_data_map.get(underlying)
          option_data_map.set(underlying, {
            ...existing_data,
            ...option_chain_data
          })

          log(
            `Completed fetching option data for ${underlying} with expiration ${expiration}`
          )

          // Add a small delay between requests to avoid overloading the server
          await new Promise((resolve) => setTimeout(resolve, 1500))
        } catch (error) {
          log(`Error fetching option data: ${error.message}`)
        }
      }

      // Update positions with delta information
      positions.forEach((position) => {
        if (
          position.type === 'option' &&
          position.option_details &&
          position.option_details.underlying
        ) {
          const underlying = position.option_details.underlying
          const option_data = option_data_map.get(underlying)

          if (option_data) {
            // Create a key to look up this option
            const exp_date = position.option_details.expiration
            const strike = position.option_details.strike.toString()
            const put_call =
              position.option_details.put_call === 'PUT' ? 'P' : 'C'

            // Try different key formats since date formats might vary
            const possible_keys = [
              `${exp_date}_${strike}_${put_call}`,
              `${exp_date}_${strike}.0_${put_call}`
            ]

            for (const key of possible_keys) {
              if (option_data[key]) {
                position.option_details.delta = option_data[key].delta
                break
              }
            }
          }
        }
      })

      log('Updated positions with delta information')
    }

    // Calculate liabilities at different probability thresholds
    const probability_thresholds = [
      0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.7, 0.9
    ]
    const liability_by_probability = {}

    // Create a map of stock positions by symbol
    const stock_positions = new Map(
      positions
        .filter((position) => position.type === 'stock')
        .map((position) => [position.symbol, position])
    )

    // Calculate probability-based liabilities
    for (const threshold of probability_thresholds) {
      liability_by_probability[
        `total_liability_greater_than_${threshold * 100}pct_prob`
      ] = positions
        .filter((position) => {
          if (position.type !== 'option' || position.quantity >= 0) return false
          const delta = position.option_details?.delta
          if (!delta) return false

          return Math.abs(delta) >= threshold
        })
        .reduce((acc, position) => {
          const stock_position = stock_positions.get(
            position.option_details.underlying
          )
          const shares_held = stock_position ? stock_position.quantity : 0
          const contracts = Math.abs(position.quantity)
          const shares_needed = contracts * 100 // Standard contract size

          if (
            position.option_details.put_call === 'CALL' &&
            shares_held >= shares_needed
          ) {
            // Call is fully covered by shares, no liability
            return acc
          } else if (
            position.option_details.put_call === 'CALL' &&
            shares_held > 0
          ) {
            // Call is partially covered, calculate remaining liability
            const uncovered_contracts = (shares_needed - shares_held) / 100
            return (
              acc + position.option_details.strike * uncovered_contracts * 100
            )
          } else {
            // Put or uncovered call
            return acc + position.option_details.strike * contracts * 100
          }
        }, 0)
    }

    // Close browser
    await browser.close()
    log('Closed browser')

    // Return combined data with new liability calculations
    return {
      accounts: accounts_with_cash_balances,
      positions,
      total_option_liability: option_liabilities.reduce(
        (sum, option) => sum + option.liability,
        0
      ),
      liability_by_probability,
      grand_total
    }
  } catch (error) {
    console.error('Error in Fidelity integration:', error)
    await browser.close()
    throw error
  }
}

export const get_activity = async ({ username, password }) => {
  const { page, browser } = await login({ username, password })

  try {
    // Navigate to activity page
    await page.goto(
      'https://digital.fidelity.com/ftgw/digital/portfolio/activity',
      { waitUntil: 'networkidle2', timeout: 60000 }
    )
    log('Navigated to activity page')
    await new Promise((resolve) => setTimeout(resolve, 5000))

    // Click the "History" tab to ensure we're on the right section
    await page.evaluate(() => {
      const tabs = document.querySelectorAll('a, button, [role="tab"]')
      for (const tab of tabs) {
        if (tab.textContent.trim() === 'History') {
          tab.click()
          return true
        }
      }
      return false
    })
    await new Promise((resolve) => setTimeout(resolve, 3000))

    // Try to expand date range using targeted selectors
    const date_filter_clicked = await page.evaluate(() => {
      const dropdowns = document.querySelectorAll(
        '[class*="date-range"], [class*="dateRange"], [class*="filter-date"], [class*="time-period"]'
      )
      for (const dd of dropdowns) {
        const clickable = dd.querySelector('button, a, [role="button"]')
        if (clickable) {
          clickable.click()
          return true
        }
      }
      return false
    })

    if (date_filter_clicked) {
      log('Expanded date filter')
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Select "Year to Date" or longest period
      await page.evaluate(() => {
        const options = Array.from(
          document.querySelectorAll(
            'li, option, [role="option"], [role="menuitem"], a'
          )
        )
        const preferred = ['year to date', '1 year', '12 months', '365', 'all']
        for (const pref of preferred) {
          for (const option of options) {
            if (option.textContent.trim().toLowerCase().includes(pref)) {
              option.click()
              return
            }
          }
        }
      })
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }

    // Scrape the history table from the page
    const scraped = await page.evaluate(() => {
      const activities = []

      // The history section has a specific table structure
      // Look for rows with date patterns in the history section
      const all_text = document.body.innerText

      // Find the "History" section - split by known markers
      const history_marker = all_text.indexOf(' Past ')
      if (history_marker === -1) return { activities: [], debug: 'no history marker found' }

      const history_section = all_text.substring(history_marker)

      // Parse rows: Date\nAccount\nDescription\nAmount
      const lines = history_section.split('\n').map(l => l.trim()).filter(l => l)

      let i = 0
      // Skip header line ("Past 30 days", "Date", "Account", "Description", "Amount")
      while (i < lines.length && !(/^[A-Z][a-z]{2}-\d{2}-\d{4}$/.test(lines[i]))) {
        i++
      }

      while (i < lines.length) {
        const line = lines[i]

        // Check if this line is a date (format: Mon-DD-YYYY e.g., Jan-30-2026)
        if (/^[A-Z][a-z]{2}-\d{2}-\d{4}$/.test(line)) {
          const date = line
          const account = lines[i + 1] || ''
          const description = lines[i + 2] || ''
          const amount = lines[i + 3] || ''

          activities.push({
            date,
            account,
            description,
            amount_raw: amount
          })

          i += 4

          // Skip any extra lines that aren't dates (sub-details of a transaction)
          while (i < lines.length && !(/^[A-Z][a-z]{2}-\d{2}-\d{4}$/.test(lines[i]))) {
            // Check if this is a continuation of the description or new section
            if (lines[i].startsWith('To check') || lines[i].startsWith('If transfers')) {
              break
            }
            i++
          }
        } else {
          i++
        }
      }

      return { activities, debug: `found ${activities.length} activities, history_section_length: ${history_section.length}` }
    })

    log(`Scraped: ${scraped.debug}`)

    if (scraped.activities.length === 0) {
      const screenshot_path = '/tmp/fidelity-activity-debug.png'
      await page.screenshot({ path: screenshot_path, fullPage: true })
      log(`Debug screenshot saved to ${screenshot_path}`)
      await browser.close()
      throw new Error(
        'No activity data found on Fidelity activity page'
      )
    }

    log(`Found ${scraped.activities.length} activities via page scraping`)

    // Parse the scraped data into the expected format
    const parsed_activities = scraped.activities.map((a) => {
      // Parse description to extract action and symbol
      const desc = a.description || ''
      let action = ''
      let symbol = ''

      // Match patterns like "YOU SOLD OPENING TRANSACTION PUT (ETHU)"
      // or "EXPIRED PUT (IREN)" or "DIVIDEND RECEIVED (VTI)"
      // or "YOU BOUGHT (MSFT)"
      if (desc.includes('SOLD')) action = 'sell'
      else if (desc.includes('BOUGHT')) action = 'buy'
      else if (desc.includes('DIVIDEND')) action = 'dividend'
      else if (desc.includes('EXPIRED')) action = 'expired'
      else if (desc.includes('TRANSFER')) action = 'transfer'
      else if (desc.includes('REINVEST')) action = 'reinvestment'
      else action = desc.split(' ').slice(0, 3).join(' ')

      // Extract symbol from parentheses
      const symbol_match = desc.match(/\(([A-Z]{1,5})\)/)
      if (symbol_match) {
        symbol = symbol_match[1]
      }

      // Parse amount
      let amount = '0'
      const amount_raw = (a.amount_raw || '').replace(/[$,]/g, '')
      if (amount_raw && amount_raw !== '--') {
        amount = amount_raw.replace('+', '')
      }

      // Parse account number from "Trust: Under Agreement ***6391" format
      const account_match = (a.account || '').match(/\*{3}(\d+)/)
      const account_number = account_match ? account_match[1] : a.account || ''

      // Convert date from Mon-DD-YYYY to MM/DD/YYYY
      const date_parts = (a.date || '').match(/([A-Z][a-z]{2})-(\d{2})-(\d{4})/)
      let date = a.date
      if (date_parts) {
        const months = {
          Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
          Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
        }
        date = `${months[date_parts[1]]}/${date_parts[2]}/${date_parts[3]}`
      }

      return {
        date,
        action,
        symbol,
        name: desc,
        quantity: '0',
        price: '0',
        amount,
        account_number
      }
    })

    await browser.close()
    log(`Parsed ${parsed_activities.length} activities`)

    return { activities: parsed_activities }
  } catch (error) {
    console.error('Error in Fidelity get_activity:', error)
    try {
      await browser.close()
    } catch (_) {
      // browser may already be closed
    }
    throw error
  }
}
