-- ---------------------------------------------------------------------------
-- create-readonly-role.sql
--
-- Creates `finsight_chat_ro`, the database role the text-to-SQL chat uses.
-- It can SELECT from the 17 ledger tables and do nothing else.
--
-- Run ONCE in the Supabase SQL editor, signed in as `postgres`. Safe to re-run.
-- Read it first: it changes a shared database.
--
-- Why policies and not BYPASSRLS: every table has row level security on with
-- no policies, so a normal role sees zero rows. These policies apply only to
-- `finsight_chat_ro` (TO clause). `anon` and `authenticated` still see nothing
-- through the Data API, and the app's own `postgres` connection is unchanged.
--
-- No password is stored here. After running, set one yourself (see the end).
-- ---------------------------------------------------------------------------

-- 1. The role: can log in, has no special powers, few connections.
do $$
begin
  if not exists (select from pg_roles where rolname = 'finsight_chat_ro') then
    create role finsight_chat_ro
      login
      nosuperuser nocreatedb nocreaterole noinherit nobypassrls
      connection limit 5;
  end if;
end
$$;

-- Lets you test as this role from the SQL editor with `set role` (see
-- verify-readonly-role.sql). It gives `postgres` nothing extra.
grant finsight_chat_ro to postgres;

-- 2. Safety limits. These are defaults for new sessions; the grants below are
--    what actually stops writes.
alter role finsight_chat_ro set default_transaction_read_only = on;
alter role finsight_chat_ro set statement_timeout = '10s';
alter role finsight_chat_ro set lock_timeout = '2s';
alter role finsight_chat_ro set idle_in_transaction_session_timeout = '15s';
alter role finsight_chat_ro set search_path = public;

-- 3. Start from nothing, then grant only SELECT on the ledger tables.
revoke all on all tables in schema public from finsight_chat_ro;
revoke all on all sequences in schema public from finsight_chat_ro;
revoke all on all functions in schema public from finsight_chat_ro;
revoke create on schema public from finsight_chat_ro;
grant usage on schema public to finsight_chat_ro;

do $$
declare
  t text;
begin
  foreach t in array array[
    'acc_type', 'ar_invoice', 'branch', 'budget', 'budget_pbalance', 'debtor',
    'dept', 'fiscal_year', 'gl_dtl', 'gl_mast', 'item', 'item_group', 'iv',
    'iv_dtl', 'pbalance', 'pl_format', 'sales_agent'
  ]
  loop
    execute format('grant select on public.%I to finsight_chat_ro', t);
    -- Row level security is on for every table, so the role also needs a policy.
    execute format('drop policy if exists chat_ro_select on public.%I', t);
    execute format(
      'create policy chat_ro_select on public.%I for select to finsight_chat_ro using (true)', t
    );
  end loop;
end
$$;

-- 4. Set a password. Run this line yourself with a long random value, and do not
--    save it in this file or commit it:
--
--      alter role finsight_chat_ro with password '<paste a long random password>';
--
-- Connection string for web/.env (CHAT_DATABASE_URL). Copy the host and port from
-- your existing DATABASE_URL. Through Supabase's pooler the username is
-- `finsight_chat_ro.<your-project-ref>`; on a direct connection it is just
-- `finsight_chat_ro`.
--
--      postgresql://finsight_chat_ro.<project-ref>:<password>@<host>:<port>/postgres
