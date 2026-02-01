import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import db from '#db'
import { isMain } from '#libs-shared'

const argv = yargs(hideBin(process.argv)).argv
const log = debug('rebuild-holdings')
debug.enable('rebuild-holdings')

const rebuild_holdings = async ({ as_of_date } = {}) => {
  log('Rebuilding holdings from transactions')

  let query = db('transactions')
    .where('transaction_type', '!=', 'balance_assertion')

  if (as_of_date) {
    query = query.where('transaction_date', '<=', as_of_date)
    log(`Computing holdings as of ${as_of_date}`)
  }

  // Get all to_link/to_symbol combinations (received amounts)
  const received = await query
    .clone()
    .select('to_link as account_link', 'to_symbol as symbol')
    .sum('to_amount as total_received')
    .whereNotNull('to_link')
    .whereNotNull('to_symbol')
    .groupBy('to_link', 'to_symbol')

  // Get all from_link/from_symbol combinations (sent amounts)
  const sent_query = db('transactions')
    .where('transaction_type', '!=', 'balance_assertion')

  if (as_of_date) {
    sent_query.where('transaction_date', '<=', as_of_date)
  }

  const sent = await sent_query
    .select('from_link as account_link', 'from_symbol as symbol')
    .sum('from_amount as total_sent')
    .whereNotNull('from_link')
    .whereNotNull('from_symbol')
    .groupBy('from_link', 'from_symbol')

  // Combine received and sent into net balances
  const balances = new Map()

  for (const row of received) {
    const key = `${row.account_link}|${row.symbol}`
    balances.set(key, {
      account_link: row.account_link,
      symbol: row.symbol,
      balance: parseFloat(row.total_received) || 0
    })
  }

  for (const row of sent) {
    const key = `${row.account_link}|${row.symbol}`
    const existing = balances.get(key)
    if (existing) {
      existing.balance += parseFloat(row.total_sent) || 0
    } else {
      balances.set(key, {
        account_link: row.account_link,
        symbol: row.symbol,
        balance: parseFloat(row.total_sent) || 0
      })
    }
  }

  // Filter out zero balances
  const non_zero_balances = Array.from(balances.values()).filter(
    (b) => Math.abs(b.balance) > 0.000001
  )

  log(`Computed ${non_zero_balances.length} non-zero holdings`)

  // Reconcile against balance assertions
  const assertions = await db('transactions')
    .where('transaction_type', 'balance_assertion')
    .select('to_link', 'to_symbol', 'to_amount', 'transaction_date', 'description')
    .orderBy('transaction_date', 'desc')

  if (assertions.length) {
    log(`\nReconciling against ${assertions.length} balance assertions:`)

    const latest_assertions = new Map()
    for (const assertion of assertions) {
      const key = `${assertion.to_link}|${assertion.to_symbol}`
      if (!latest_assertions.has(key)) {
        latest_assertions.set(key, assertion)
      }
    }

    let discrepancies = 0
    for (const [key, assertion] of latest_assertions) {
      const computed = balances.get(key)
      const computed_balance = computed ? computed.balance : 0
      const asserted_balance = parseFloat(assertion.to_amount) || 0
      const diff = Math.abs(computed_balance - asserted_balance)

      if (diff > 0.01) {
        log(
          `  DISCREPANCY: ${assertion.to_link} ${assertion.to_symbol}: computed=${computed_balance.toFixed(6)} asserted=${asserted_balance.toFixed(6)} diff=${diff.toFixed(6)}`
        )
        discrepancies++
      }
    }

    if (discrepancies === 0) {
      log('  All balance assertions match computed holdings')
    } else {
      log(`  ${discrepancies} discrepancies found`)
    }
  }

  // Rebuild holdings table
  const inserts = non_zero_balances.map((b) => ({
    link: b.account_link,
    name: b.symbol,
    cost_basis: null,
    quantity: b.balance,
    symbol: b.symbol,
    asset_link: `/asset/${b.symbol.toLowerCase()}`
  }))

  if (inserts.length) {
    await db.transaction(async (trx) => {
      await trx('holdings').truncate()
      log('Truncated holdings table')

      await trx('holdings').insert(inserts).onConflict('link').merge()
      log(`Inserted ${inserts.length} holdings`)
    })
  }

  return { holdings_count: inserts.length }
}

const main = async () => {
  try {
    const as_of_date = argv.asOf || argv['as-of']
    const result = await rebuild_holdings({ as_of_date })
    log(`Rebuild complete: ${result.holdings_count} holdings`)
    return 0
  } catch (err) {
    log(`Error: ${err.message}`)
    console.error(err)
    return 1
  }
}

export default rebuild_holdings

if (isMain(import.meta.url)) {
  main().then((exit_code) => process.exit(exit_code))
}
