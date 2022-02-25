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

DROP TABLE IF EXISTS `cpi`;

CREATE TABLE `cpi` (
  `d` datetime NOT NULL,
  `v` int unsigned NOT NULL,
  UNIQUE KEY `date` (`d`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;
