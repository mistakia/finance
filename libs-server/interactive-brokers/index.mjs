// Import client modules
import {
  get_account_summary,
  get_account_positions,
  account_summary_tags
} from './client/raw-data.mjs'

import { get_market_data, get_stock_market_data } from './market-data.mjs'

// Import analysis modules
import * as base_analysis from './analysis/base.mjs'
import * as risk_analysis from './analysis/risk.mjs'
import * as strategy_analysis from './analysis/strategy.mjs'
import * as probability_analysis from './analysis/probability.mjs'

// Import docker and connection modules
import {
  get_docker_containers,
  start_docker_container,
  stop_docker_container
} from './docker.mjs'

import { create_ib_client, connect_ib_with_retry } from './connection.mjs'

// Import main account info module
import { get_account_info } from './get-account-info.mjs'

// Import utility modules
import { create_event_promise } from './utils/events.mjs'
import { with_retry } from './utils/retry.mjs'

// Export everything
export {
  // Main function
  get_account_info,

  // Client modules
  get_account_summary,
  get_account_positions,
  get_market_data,
  get_stock_market_data,
  account_summary_tags,

  // Analysis modules
  base_analysis,
  risk_analysis,
  strategy_analysis,
  probability_analysis,

  // Docker and connection modules
  get_docker_containers,
  start_docker_container,
  stop_docker_container,
  create_ib_client,
  connect_ib_with_retry,

  // Utility modules
  create_event_promise,
  with_retry
}
