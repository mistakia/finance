DROP TABLE IF EXISTS `adjusted_daily_prices`;

CREATE TABLE `adjusted_daily_prices` (
  `symbol` varchar(10) NOT NULL,
  `quote_date` datetime NOT NULL,
  `o` decimal(12,2) NOT NULL,
  `h` decimal(12,2) NOT NULL,
  `l` decimal(12,2) NOT NULL,
  `c` decimal(12,2) NOT NULL,
  `v` bigint unsigned NOT NULL,
  UNIQUE KEY `symbol` (`symbol`,`quote_date`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

DROP TABLE IF EXISTS `eod_equity_quotes`;

CREATE TABLE `eod_equity_quotes` (
  `symbol` varchar(10) NOT NULL,
  `quote_date` datetime NOT NULL,
  `o` decimal(12,2) NOT NULL,
  `h` decimal(12,2) NOT NULL,
  `l` decimal(12,2) NOT NULL,
  `c` decimal(12,2) NOT NULL,
  `c_adj` decimal(12,2) NOT NULL,
  `v` bigint unsigned NOT NULL,
  `quote_unixtime` bigint unsigned NOT NULL,

  `change_in_1d` decimal(6,3) DEFAULT NULL,
  `change_in_7d` decimal(6,3) DEFAULT NULL,
  `change_in_14d` decimal(6,3) DEFAULT NULL,
  `change_in_30d` decimal(6,3) DEFAULT NULL,
  `change_in_40d` decimal(6,3) DEFAULT NULL,

  `relative_strength_index_14` decimal(4,1) DEFAULT NULL,
  `moving_average_14` decimal(7,3) DEFAULT NULL,
  `moving_average_125` decimal(7,3) DEFAULT NULL,
  `average_true_range_14_normalized` decimal(4,3) DEFAULT NULL,
  `weighted_moving_average_9` decimal(7,2) DEFAULT NULL,
  `weighted_moving_average_diff_pct` decimal(6,3) DEFAULT NULL,

  `trailing_volatility_2` decimal(6,3) DEFAULT NULL,
  `trailing_volatility_7` decimal(6,3) DEFAULT NULL,
  `trailing_volatility_10` decimal(6,3) DEFAULT NULL,
  `trailing_volatility_14` decimal(6,3) DEFAULT NULL,
  `trailing_volatility_30` decimal(6,3) DEFAULT NULL,

  `trailing_volatility_2_moving_average_9` decimal(6,3) DEFAULT NULL,
  `trailing_volatility_2_moving_average_9_change_pct` double(4,1) DEFAULT NULL,
  `trailing_volatility_2_moving_average_9_diff_pct` decimal(4,1) DEFAULT NULL,
  `trailing_volatility_10_moving_average_9` decimal(6,3) DEFAULT NULL,
  `trailing_volatility_10_moving_average_9_change_pct` decimal(4,1) DEFAULT NULL,
  `trailing_volatility_10_moving_average_9_diff_pct` decimal(4,1) DEFAULT NULL,
  `trailing_volatility_30_moving_average_9` decimal(6,3) DEFAULT NULL,
  `trailing_volatility_30_moving_average_9_change_pct` decimal(4,1) DEFAULT NULL,
  `trailing_volatility_30_moving_average_9_diff_pct` decimal(4,1) DEFAULT NULL,

  `maxdrawdown_10` decimal(6,5) DEFAULT NULL,
  `maxdrawdown_14` decimal(6,5) DEFAULT NULL,
  `maxdrawdown_30` decimal(6,5) DEFAULT NULL,
  `maxdrawdown_60` decimal(6,5) DEFAULT NULL,

  `cumulative_change_1` decimal(6,3) DEFAULT NULL,
  `cumulative_change_5` decimal(6,3) DEFAULT NULL,
  `cumulative_change_7` decimal(6,3) DEFAULT NULL,
  `cumulative_change_10` decimal(6,3) DEFAULT NULL,
  `cumulative_change_21` decimal(6,3) DEFAULT NULL,
  `cumulative_change_42` decimal(6,3) DEFAULT NULL,
  `cumulative_change_60` decimal(6,3) DEFAULT NULL,
  `cumulative_change_200` decimal(6,3) DEFAULT NULL,

  UNIQUE KEY `symbol` (`symbol`,`quote_date`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

DROP TABLE IF EXISTS `assets`;

CREATE TABLE `assets` (
  `link` varchar(200) NOT NULL,
  `symbol` varchar(20) NOT NULL,
  `market_value_usd` decimal(65,30) DEFAULT NULL,
  `asset_class` varchar(200) NOT NULL,
  `type` varchar(200) NOT NULL,
  UNIQUE KEY `link` (`link`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

DROP TABLE IF EXISTS `cpi`;

CREATE TABLE `cpi` (
  `quote_date` datetime NOT NULL,
  `v` int unsigned NOT NULL,
  UNIQUE KEY `date` (`quote_date`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

DROP TABLE IF EXISTS `holdings`;

CREATE TABLE `holdings` (
  `link` varchar(200) NOT NULL comment '/[user]/[custodian]/[symbol]',
  `name` varchar(200) NOT NULL,
  `cost_basis` decimal(65,30) DEFAULT NULL,
  `quantity` decimal(65,30) NOT NULL,
  `symbol` varchar(20) DEFAULT NULL,
  `asset_link` varchar(2000) NOT NULL,
  UNIQUE KEY `link` (`link`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

DROP TABLE IF EXISTS `transactions`;

CREATE TABLE `transactions` (
  `link` varchar(200) NOT NULL comment '/[user]/[link]/[link-id]',
  `type` varchar(15) DEFAULT NULL comment 'exchange,transfer,purchase,income',
  `from_link` varchar(1000) DEFAULT NULL,
  `from_amount` decimal(65,30) DEFAULT NULL,
  `from_symbol` varchar(20) DEFAULT NULL,
  `to_link` varchar(1000) DEFAULT NULL,
  `to_amount` decimal(65,30) DEFAULT NULL,
  `to_symbol` varchar(20) DEFAULT NULL,
  `fee_amount` decimal(65,30) DEFAULT NULL,
  `fee_symbol` varchar(20) DEFAULT NULL,
  `fee_link` varchar(1000) DEFAULT NULL,
  `date` int(11) DEFAULT NULL,
  `tx_id` varchar(200) DEFAULT NULL,
  `tx_src` varchar(200) DEFAULT NULL,
  `tx_dest` varchar(200) DEFAULT NULL,
  `tx_label` varchar(100) DEFAULT NULL,
  `desc` varchar(200) DEFAULT NULL,
  UNIQUE KEY `link` (`link`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

DROP TABLE IF EXISTS `eod_option_quotes`;

CREATE TABLE `eod_option_quotes` (
  `call_symbol` varchar(21) NOT NULL,
  `put_symbol` varchar(21) NOT NULL,
  `underlying_symbol` varchar(20) NOT NULL,

  `quote_unixtime` INT,
  `quote_readtime` DATETIME,
  `quote_date` DATE,
  `quote_time_hours` TIME,
  `underlying_last` FLOAT,
  `expire_date` DATE,
  `expire_unix` INT,
  `dte` INT,
  `c_delta` FLOAT,
  `c_gamma` FLOAT,
  `c_vega` FLOAT,
  `c_theta` FLOAT,
  `c_rho` FLOAT,
  `c_iv` FLOAT,
  `c_volume` INT,
  `c_last` FLOAT,
  `c_size` INT,
  `c_bid` FLOAT,
  `c_ask` FLOAT,
  `strike` FLOAT,
  `p_bid` FLOAT,
  `p_ask` FLOAT,
  `p_size` INT,
  `p_last` FLOAT,
  `p_delta` FLOAT,
  `p_gamma` FLOAT,
  `p_vega` FLOAT,
  `p_theta` FLOAT,
  `p_rho` FLOAT,
  `p_iv` FLOAT,
  `p_volume` INT,
  `strike_distance` FLOAT,
  `strike_distance_pct` FLOAT,

  `expire_quote` FLOAT,
  `expire_distance` FLOAT,
  `expire_distance_pct` FLOAT,

  `days_to_breakeven` INT,

  PRIMARY KEY (`underlying_symbol`,`quote_date`,`expire_date`,`strike`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

DROP TABLE IF EXISTS `backtests`;

CREATE TABLE `backtests` (
  `name` varchar(200) NOT NULL,
  `start_date` datetime NOT NULL,
  `end_date` datetime NOT NULL,
  `start_value` decimal(15,2) NOT NULL,
  `end_value` decimal(15,2) NOT NULL,
  `return_pct` decimal(15,2) NOT NULL,
  -- `max_drawdown` decimal(6,3) NOT NULL,
  `transactions` int(11) NOT NULL,
  `options_sold` int(11) NOT NULL,
  `options_closed` int(11) NOT NULL,
  `options_exercised` int(11) NOT NULL,
  -- `win_transactions` int(11) NOT NULL,
  -- `loss_transactions` int(11) NOT NULL,
  -- `win_pct` decimal(6,3) NOT NULL,
  -- `avg_win_pct` decimal(6,3) NOT NULL,
  -- `avg_loss_pct` decimal(6,3) NOT NULL,
  -- `avg_win_loss_pct` decimal(6,3) NOT NULL,
  -- `cagr` decimal(6,3) NOT NULL,
  -- `sharpe` decimal(6,3) NOT NULL,
  -- `sortino` decimal(6,3) NOT NULL,
  -- `calmar` decimal(6,3) NOT NULL,
  -- `profit_factor` decimal(6,3) NOT NULL,

  UNIQUE KEY `backtest` (`name`,`start_date`,`end_date`, `start_value`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;