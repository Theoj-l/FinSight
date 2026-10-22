-- Additive upgrade. Existing ledger, budget, model and anomaly data are untouched.
CREATE TABLE IF NOT EXISTS financial_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  rules jsonb NOT NULL DEFAULT '{}',
  notification_source varchar(12) NOT NULL DEFAULT 'previous' CHECK (notification_source IN ('previous','budget','auto','manual')),
  updated_by varchar(128),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS financial_manual_forecast (
  dept_no varchar(10) NOT NULL REFERENCES dept(dept_no),
  period_no integer NOT NULL CHECK (period_no BETWEEN 100001 AND 999912 AND period_no % 100 BETWEEN 1 AND 12),
  metric varchar(12) NOT NULL CHECK (metric IN ('revenue','netProfit')),
  amount numeric(19,4) NOT NULL,
  updated_by varchar(128),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dept_no, period_no, metric)
);
ALTER TABLE financial_settings ADD COLUMN IF NOT EXISTS notification_budget_key bigint REFERENCES budget(budget_key) ON DELETE SET NULL;
ALTER TABLE financial_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_manual_forecast ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE financial_settings IS 'Shared company financial deviation rules and Home notification source. Authenticated server routes own access.';
COMMENT ON TABLE financial_manual_forecast IS 'Human estimates, kept separately from model forecasts and ledger facts.';
