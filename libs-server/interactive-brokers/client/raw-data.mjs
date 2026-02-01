import { EventName } from '@stoqey/ib'
import debug from 'debug'
import { create_event_promise } from '../utils/events.mjs'

const log = debug('interactive-brokers:raw-data')

export const account_summary_tags = [
  'NetLiquidation',
  'TotalCashValue',
  'SettledCash',
  'GrossPositionValue'
]

export const get_account_summary = (ib) => {
  const summary = new Map()

  const account_summary_handler = (req_id, account, tag, value) => {
    if (!summary.has(tag) && account_summary_tags.includes(tag)) {
      summary.set(tag, value)
    }
  }

  return new Promise((resolve, reject) => {
    create_event_promise({
      emitter: ib.api,
      success_event: EventName.accountSummaryEnd,
      error_event: EventName.error,
      handlers: {
        [EventName.accountSummary]: account_summary_handler
      },
      timeout_ms: 30000
    })
      .then(() => {
        resolve(summary)
      })
      .catch(reject)

    // Important: Start the account summary request
    ib.getAccountSummary('All', account_summary_tags.join(',')).subscribe({
      error: (err) => {
        log('Error in account summary subscription:', err)
        reject(err)
      }
    })
  })
}

export const get_executions = async (ib) => {
  // IBApiNext provides getExecutionDetails which returns Promise<ExecutionDetail[]>
  // Each ExecutionDetail has { reqId, contract, execution }
  const details = await ib.getExecutionDetails({})
  return details.map((d) => ({ contract: d.contract, execution: d.execution }))
}

export const get_completed_orders = (ib) => {
  const orders = []

  const order_handler = (contract, order, orderState) => {
    orders.push({ contract, order, orderState })
  }

  return new Promise((resolve, reject) => {
    create_event_promise({
      emitter: ib.api,
      success_event: EventName.completedOrdersEnd,
      error_event: EventName.error,
      handlers: {
        [EventName.completedOrder]: order_handler
      },
      timeout_ms: 30000
    })
      .then(() => {
        resolve(orders)
      })
      .catch(reject)

    // Use ib.api (low-level IBApi) since IBApiNext doesn't wrap reqCompletedOrders
    ib.api.reqCompletedOrders(false)
  })
}

export const get_account_positions = (ib) => {
  const positions = []

  const position_handler = (account, contract, pos, avgCost) => {
    positions.push({ account, contract, pos, avgCost })
  }

  return new Promise((resolve, reject) => {
    create_event_promise({
      emitter: ib.api,
      success_event: EventName.positionEnd,
      error_event: EventName.error,
      handlers: {
        [EventName.position]: position_handler
      },
      timeout_ms: 30000
    })
      .then(() => {
        resolve(positions)
      })
      .catch(reject)

    // Important: Start the positions request
    ib.getPositions().subscribe({
      error: (err) => {
        log('Error in positions subscription:', err)
        reject(err)
      }
    })
  })
}
