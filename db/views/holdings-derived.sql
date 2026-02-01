-- Derived holdings view: computes current balances by replaying all transactions
-- Each row represents the net position for an account+symbol pair

CREATE OR REPLACE VIEW public.holdings_derived AS
SELECT
  sub.account_link,
  sub.symbol,
  SUM(sub.amount) AS net_balance
FROM (
  SELECT
    t.to_link AS account_link,
    t.to_symbol AS symbol,
    t.to_amount AS amount
  FROM public.transactions t
  WHERE t.to_link IS NOT NULL
    AND t.to_symbol IS NOT NULL
    AND t.transaction_type != 'balance_assertion'

  UNION ALL

  SELECT
    t.from_link AS account_link,
    t.from_symbol AS symbol,
    t.from_amount AS amount
  FROM public.transactions t
  WHERE t.from_link IS NOT NULL
    AND t.from_symbol IS NOT NULL
    AND t.transaction_type != 'balance_assertion'
) sub
GROUP BY sub.account_link, sub.symbol
HAVING SUM(sub.amount) != 0;

-- Holdings at a specific point in time (use as a function)
CREATE OR REPLACE FUNCTION public.holdings_as_of(as_of_date date)
RETURNS TABLE (
  account_link character varying,
  symbol character varying,
  net_balance numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sub.account_link,
    sub.symbol,
    SUM(sub.amount) AS net_balance
  FROM (
    SELECT
      t.to_link AS account_link,
      t.to_symbol AS symbol,
      t.to_amount AS amount
    FROM public.transactions t
    WHERE t.to_link IS NOT NULL
      AND t.to_symbol IS NOT NULL
      AND t.transaction_date <= as_of_date
      AND t.transaction_type != 'balance_assertion'

    UNION ALL

    SELECT
      t.from_link AS account_link,
      t.from_symbol AS symbol,
      t.from_amount AS amount
    FROM public.transactions t
    WHERE t.from_link IS NOT NULL
      AND t.from_symbol IS NOT NULL
      AND t.transaction_date <= as_of_date
      AND t.transaction_type != 'balance_assertion'
  ) sub
  GROUP BY sub.account_link, sub.symbol
  HAVING SUM(sub.amount) != 0;
END;
$$ LANGUAGE plpgsql;
