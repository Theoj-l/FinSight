-- ---------------------------------------------------------------------------
-- grant-ml-tables.sql
--
-- Lets the read-only chat role see the ML service's anomaly and forecast
-- results, so questions about anomalies and forecasts can be answered.
--
-- Run ONCE in the Supabase SQL editor as `postgres`, after create-readonly-role.sql.
-- Safe to re-run. Same approach as before: SELECT only, and a read policy that
-- applies only to finsight_chat_ro (these tables have row level security on).
--
-- Deliberately NOT included: financial_settings (app settings and user names) and
-- financial_manual_forecast (people's own forecast edits).
--
-- After running it, set TEXT_TO_SQL_ML_TABLES=true in web/.env so the pipeline
-- tells the model these tables exist and allows queries on them.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['anomaly_alert', 'anomaly_run', 'forecast_run', 'forecast_value']
  loop
    execute format('grant select on public.%I to finsight_chat_ro', t);
    execute format('drop policy if exists chat_ro_select on public.%I', t);
    execute format(
      'create policy chat_ro_select on public.%I for select to finsight_chat_ro using (true)', t
    );
  end loop;
end
$$;

-- Check: this should list exactly the 17 ledger tables plus these 4, all SELECT only.
--
--   select table_name, privilege_type
--   from information_schema.role_table_grants
--   where grantee = 'finsight_chat_ro' order by 1;
