DROP TABLE IF EXISTS `adjusted_daily_prices`;

CREATE TABLE `adjusted_daily_prices` (
  `symbol` varchar(10) NOT NULL,
  `d` datetime NOT NULL,
  `o` decimal(12,2) NOT NULL,
  `h` decimal(12,2) NOT NULL,
  `l` decimal(12,2) NOT NULL,
  `c` decimal(12,2) NOT NULL,
  `v` bigint unsigned NOT NULL,
  UNIQUE KEY `symbol` (`symbol`,`d`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

DROP TABLE IF EXISTS `daily_prices`;

CREATE TABLE `daily_prices` (
  `symbol` varchar(10) NOT NULL,
  `d` datetime NOT NULL,
  `o` decimal(12,2) NOT NULL,
  `h` decimal(12,2) NOT NULL,
  `l` decimal(12,2) NOT NULL,
  `c` decimal(12,2) NOT NULL,
  `v` bigint unsigned NOT NULL,

  `change_in_7d` decimal(6,3) DEFAULT NULL,
  `change_in_14d` decimal(6,3) DEFAULT NULL,
  `change_in_30d` decimal(6,3) DEFAULT NULL,
  `change_in_40d` decimal(6,3) DEFAULT NULL,

  `wma_diff_pct` decimal(6,3) DEFAULT NULL,

  `rsi` tinyint unsigned DEFAULT NULL,

  UNIQUE KEY `symbol` (`symbol`,`d`)
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
  `d` datetime NOT NULL,
  `v` int unsigned NOT NULL,
  UNIQUE KEY `date` (`d`)
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
  `symbol` varchar(20) NOT NULL,

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

  PRIMARY KEY (`symbol`,`quote_date`,`expire_date`,`strike`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;
