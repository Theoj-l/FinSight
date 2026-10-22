-- Additive upgrade for an existing FinSight database.
ALTER TABLE anomaly_alert ADD COLUMN IF NOT EXISTS evidence jsonb;
COMMENT ON COLUMN anomaly_alert.evidence IS 'Versioned review evidence, comparison values, source IDs and as-of snapshots; not model inputs.';
