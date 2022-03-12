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

DROP TABLE IF EXISTS `assets`;

CREATE TABLE `assets` (
  `link` varchar(200) NOT NULL,
  `name` varchar(200) NOT NULL,
  `cost_basis` decimal(65,30) NOT NULL,
  `quantity` decimal(65,30) NOT NULL,
  `symbol` varchar(20) DEFAULT NULL,
  UNIQUE KEY `link` (`link`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

DROP TABLE IF EXISTS `cpi`;

CREATE TABLE `cpi` (
  `d` datetime NOT NULL,
  `v` int unsigned NOT NULL,
  UNIQUE KEY `date` (`d`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;
