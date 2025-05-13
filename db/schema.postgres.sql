--
-- PostgreSQL database dump
--

-- Dumped from database version 15.12 (Ubuntu 15.12-1.pgdg24.04+1)
-- Dumped by pg_dump version 15.12 (Ubuntu 15.12-1.pgdg24.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

DROP INDEX IF EXISTS public.idx_transactions_tx_src;
DROP INDEX IF EXISTS public.idx_transactions_tx_dest;
DROP INDEX IF EXISTS public.idx_transactions_transaction_info;
DROP INDEX IF EXISTS public.idx_transactions_original_data;
DROP INDEX IF EXISTS public.idx_transactions_date;
DROP INDEX IF EXISTS public.idx_transactions_categories;
ALTER TABLE IF EXISTS ONLY public.transactions DROP CONSTRAINT IF EXISTS transactions_pkey;
ALTER TABLE IF EXISTS ONLY public.holdings DROP CONSTRAINT IF EXISTS holdings_pkey;
ALTER TABLE IF EXISTS ONLY public.exchange_symbols DROP CONSTRAINT IF EXISTS exchange_symbols_pkey;
ALTER TABLE IF EXISTS ONLY public.eod_option_quotes DROP CONSTRAINT IF EXISTS eod_option_quotes_pkey;
ALTER TABLE IF EXISTS ONLY public.end_of_day_equity_quotes DROP CONSTRAINT IF EXISTS eod_equity_quotes_pkey;
ALTER TABLE IF EXISTS ONLY public.earnings DROP CONSTRAINT IF EXISTS earnings_pkey;
ALTER TABLE IF EXISTS ONLY public.cpi DROP CONSTRAINT IF EXISTS cpi_pkey;
ALTER TABLE IF EXISTS ONLY public.config DROP CONSTRAINT IF EXISTS config_pkey;
ALTER TABLE IF EXISTS ONLY public.backtests DROP CONSTRAINT IF EXISTS backtests_pkey;
ALTER TABLE IF EXISTS ONLY public.assets DROP CONSTRAINT IF EXISTS assets_pkey;
ALTER TABLE IF EXISTS ONLY public.adjusted_equity_quotes DROP CONSTRAINT IF EXISTS adjusted_daily_prices_pkey;
DROP TABLE IF EXISTS public.transactions;
DROP TABLE IF EXISTS public.holdings;
DROP TABLE IF EXISTS public.exchange_symbols;
DROP TABLE IF EXISTS public.eod_option_quotes;
DROP TABLE IF EXISTS public.end_of_day_equity_quotes;
DROP TABLE IF EXISTS public.earnings;
DROP TABLE IF EXISTS public.cpi;
DROP TABLE IF EXISTS public.config;
DROP TABLE IF EXISTS public.backtests;
DROP TABLE IF EXISTS public.assets;
DROP TABLE IF EXISTS public.adjusted_equity_quotes;
DROP TYPE IF EXISTS public.transaction_type_enum;
DROP TYPE IF EXISTS public.event_time_type_enum;
DROP TYPE IF EXISTS public.asset_type_enum;
--
-- Name: asset_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.asset_type_enum AS ENUM (
    'us_reit',
    'us_etp',
    'us_stock',
    'currency',
    'loan_mortgage',
    'note',
    'loan_crypto',
    'crypto',
    'cn_adr'
);


--
-- Name: event_time_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.event_time_type_enum AS ENUM (
    'time_after_session',
    'after_market_close',
    'before_market_open',
    'during_market_hours',
    'unspecified'
);


--
-- Name: transaction_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transaction_type_enum AS ENUM (
    'exchange',
    'transfer',
    'purchase',
    'income',
    'return',
    'fee'
);


SET default_table_access_method = heap;

--
-- Name: adjusted_equity_quotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adjusted_equity_quotes (
    symbol character varying(10) NOT NULL,
    quote_date timestamp without time zone NOT NULL,
    open_price numeric(12,2) NOT NULL,
    high_price numeric(12,2) NOT NULL,
    low_price numeric(12,2) NOT NULL,
    close_price numeric(12,2) NOT NULL,
    volume bigint NOT NULL
);


--
-- Name: assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assets (
    link character varying(200) NOT NULL,
    symbol character varying(20) NOT NULL,
    market_value_usd numeric(65,30) DEFAULT NULL::numeric,
    asset_class character varying(200) NOT NULL,
    asset_type public.asset_type_enum NOT NULL
);


--
-- Name: backtests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.backtests (
    name character varying(200) NOT NULL,
    start_date timestamp without time zone NOT NULL,
    end_date timestamp without time zone NOT NULL,
    start_value numeric(15,2) NOT NULL,
    end_value numeric(15,2) NOT NULL,
    return_pct numeric(15,2) NOT NULL,
    transactions integer NOT NULL,
    options_sold integer NOT NULL,
    options_closed integer NOT NULL,
    options_exercised integer NOT NULL
);


--
-- Name: config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.config (
    key character varying(255) NOT NULL,
    value jsonb,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: cpi; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cpi (
    quote_date timestamp without time zone NOT NULL,
    v integer NOT NULL
);


--
-- Name: earnings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.earnings (
    symbol character varying(10) NOT NULL,
    company_name character varying(200) NOT NULL,
    event_name character varying(100) DEFAULT NULL::character varying,
    event_date timestamp without time zone NOT NULL,
    event_timezone character varying(100) NOT NULL,
    event_gmt_offset_ms integer NOT NULL,
    event_date_unix integer NOT NULL,
    event_time_type public.event_time_type_enum,
    earnings_estimate numeric(12,2) DEFAULT NULL::numeric,
    earnings_actual numeric(12,2) DEFAULT NULL::numeric,
    earnings_surprise_pct numeric(6,3) DEFAULT NULL::numeric
);


--
-- Name: end_of_day_equity_quotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.end_of_day_equity_quotes (
    symbol character varying(10) NOT NULL,
    quote_date timestamp with time zone NOT NULL,
    open_price numeric(12,2) NOT NULL,
    high_price numeric(12,2) NOT NULL,
    low_price numeric(12,2) NOT NULL,
    close_price numeric(12,2) NOT NULL,
    adjusted_close_price numeric(12,2) NOT NULL,
    volume bigint NOT NULL,
    quote_unix_timestamp bigint NOT NULL,
    change_in_1d numeric(6,3),
    change_in_7d numeric(6,3),
    change_in_14d numeric(6,3),
    change_in_30d numeric(6,3),
    change_in_40d numeric(6,3),
    relative_strength_index_14 numeric(4,1),
    moving_average_14 numeric(7,3),
    moving_average_125 numeric(7,3),
    average_true_range_14_normalized numeric(4,3),
    weighted_moving_average_9 numeric(12,2),
    weighted_moving_average_diff_pct numeric(6,3),
    trailing_volatility_2 numeric(8,3),
    trailing_volatility_7 numeric(8,3),
    trailing_volatility_10 numeric(8,3),
    trailing_volatility_14 numeric(8,3),
    trailing_volatility_30 numeric(8,3),
    trailing_volatility_2_moving_average_9 numeric(8,3),
    trailing_volatility_2_moving_average_9_change_pct double precision,
    trailing_volatility_2_moving_average_9_diff_pct numeric(4,1),
    trailing_volatility_10_moving_average_9 numeric(8,3),
    trailing_volatility_10_moving_average_9_change_pct numeric(4,1),
    trailing_volatility_10_moving_average_9_diff_pct numeric(4,1),
    trailing_volatility_30_moving_average_9 numeric(8,3),
    trailing_volatility_30_moving_average_9_change_pct numeric(4,1),
    trailing_volatility_30_moving_average_9_diff_pct numeric(4,1),
    maxdrawdown_10 numeric(6,3),
    maxdrawdown_14 numeric(6,3),
    maxdrawdown_30 numeric(6,3),
    maxdrawdown_60 numeric(6,3),
    cumulative_change_1 numeric(6,3),
    cumulative_change_5 numeric(6,3),
    cumulative_change_7 numeric(6,3),
    cumulative_change_10 numeric(6,3),
    cumulative_change_21 numeric(6,3),
    cumulative_change_42 numeric(6,3),
    cumulative_change_60 numeric(6,3),
    cumulative_change_200 numeric(6,3),
    relative_strength_index_10 numeric(4,1)
);


--
-- Name: eod_option_quotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eod_option_quotes (
    call_symbol character varying(21) NOT NULL,
    put_symbol character varying(21) NOT NULL,
    underlying_symbol character varying(20) NOT NULL,
    quote_unixtime integer,
    quote_readtime timestamp without time zone,
    quote_date date NOT NULL,
    quote_time_hours time without time zone,
    underlying_last real,
    expire_date date NOT NULL,
    expire_unix integer,
    dte integer,
    c_delta real,
    c_gamma real,
    c_vega real,
    c_theta real,
    c_rho real,
    c_iv real,
    c_volume integer,
    c_last real,
    c_size integer,
    c_bid real,
    c_ask real,
    strike real NOT NULL,
    p_bid real,
    p_ask real,
    p_size integer,
    p_last real,
    p_delta real,
    p_gamma real,
    p_vega real,
    p_theta real,
    p_rho real,
    p_iv real,
    p_volume integer,
    strike_distance real,
    strike_distance_pct real,
    expire_quote real,
    expire_distance real,
    expire_distance_pct real,
    days_to_breakeven integer
);


--
-- Name: exchange_symbols; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_symbols (
    symbol character varying(20) NOT NULL,
    exchange character varying(20) NOT NULL,
    full_name character varying(200),
    description character varying(500),
    type character varying(50),
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: holdings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.holdings (
    link character varying(200) NOT NULL,
    name character varying(200) NOT NULL,
    cost_basis numeric(65,30) DEFAULT NULL::numeric,
    quantity numeric(65,30) NOT NULL,
    symbol character varying(20) DEFAULT NULL::character varying,
    asset_link character varying(2000) NOT NULL
);


--
-- Name: COLUMN holdings.link; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.holdings.link IS '/[user]/[custodian]/[symbol]';


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    link character varying(200) NOT NULL,
    transaction_type public.transaction_type_enum,
    from_link character varying(1000) DEFAULT NULL::character varying,
    from_amount numeric(65,30) DEFAULT NULL::numeric,
    from_symbol character varying(20) DEFAULT NULL::character varying,
    to_link character varying(1000) DEFAULT NULL::character varying,
    to_amount numeric(65,30) DEFAULT NULL::numeric,
    to_symbol character varying(20) DEFAULT NULL::character varying,
    fee_amount numeric(65,30) DEFAULT NULL::numeric,
    fee_symbol character varying(20) DEFAULT NULL::character varying,
    fee_link character varying(1000) DEFAULT NULL::character varying,
    transaction_unix integer,
    tx_id character varying(200) DEFAULT NULL::character varying,
    tx_src character varying(200) DEFAULT NULL::character varying,
    tx_dest character varying(200) DEFAULT NULL::character varying,
    tx_label character varying(100) DEFAULT NULL::character varying,
    description character varying(200) DEFAULT NULL::character varying,
    transaction_time time without time zone,
    categories text[],
    original_data jsonb,
    transaction_info jsonb,
    transaction_date date
);


--
-- Name: COLUMN transactions.link; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.link IS '/[user]/[link]/[link-id]';


--
-- Name: adjusted_equity_quotes adjusted_daily_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adjusted_equity_quotes
    ADD CONSTRAINT adjusted_daily_prices_pkey UNIQUE (symbol, quote_date);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey UNIQUE (link);


--
-- Name: backtests backtests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backtests
    ADD CONSTRAINT backtests_pkey UNIQUE (name, start_date, end_date, start_value);


--
-- Name: config config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config
    ADD CONSTRAINT config_pkey PRIMARY KEY (key);


--
-- Name: cpi cpi_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cpi
    ADD CONSTRAINT cpi_pkey UNIQUE (quote_date);


--
-- Name: earnings earnings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.earnings
    ADD CONSTRAINT earnings_pkey UNIQUE (symbol, event_date);


--
-- Name: end_of_day_equity_quotes eod_equity_quotes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.end_of_day_equity_quotes
    ADD CONSTRAINT eod_equity_quotes_pkey UNIQUE (symbol, quote_date);


--
-- Name: eod_option_quotes eod_option_quotes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eod_option_quotes
    ADD CONSTRAINT eod_option_quotes_pkey PRIMARY KEY (underlying_symbol, quote_date, expire_date, strike);


--
-- Name: exchange_symbols exchange_symbols_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_symbols
    ADD CONSTRAINT exchange_symbols_pkey PRIMARY KEY (symbol, exchange);


--
-- Name: holdings holdings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.holdings
    ADD CONSTRAINT holdings_pkey UNIQUE (link);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey UNIQUE (link);


--
-- Name: idx_transactions_categories; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_categories ON public.transactions USING gin (categories);


--
-- Name: idx_transactions_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_date ON public.transactions USING btree (transaction_unix);


--
-- Name: idx_transactions_original_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_original_data ON public.transactions USING gin (original_data);


--
-- Name: idx_transactions_transaction_info; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_transaction_info ON public.transactions USING gin (transaction_info);


--
-- Name: idx_transactions_tx_dest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_tx_dest ON public.transactions USING btree (tx_dest);


--
-- Name: idx_transactions_tx_src; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_tx_src ON public.transactions USING btree (tx_src);


--
-- PostgreSQL database dump complete
--

