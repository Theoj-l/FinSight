-- ---------------------------------------------------------------------------
-- verify-readonly-role.sql
--
-- Proves finsight_chat_ro can read and nothing else. Run AFTER
-- create-readonly-role.sql, in the Supabase SQL editor. Paste the whole file and
-- run it once.
--
-- Safe by design:
--   * It stops before running anything if the role switch did not apply, so a
--     failed switch can never touch your data as `postgres`.
--   * Every write attempt is trapped and recorded, not left to crash the script.
--   * It always ends by raising an error, which rolls the whole transaction back.
--     That error is the report: read the message. Nothing can persist.
--
-- If the editor then complains that the "current transaction is aborted", run
-- `rollback;` on its own and carry on.
-- ---------------------------------------------------------------------------

begin;
set local role finsight_chat_ro;

do $$
declare
  report text := '';
  failed boolean := false;
  readable bigint;
begin
  if current_user <> 'finsight_chat_ro' then
    raise exception 'ABORTED: the role switch did not apply (current_user = %). Nothing was run.', current_user;
  end if;

  -- Reading must work, and must see rows (zero rows would mean a missing policy).
  begin
    select count(*) into readable from public.pbalance;
    if readable > 0 then
      report := report || E'PASS  can read pbalance (' || readable || E' rows)\n';
    else
      failed := true;
      report := report || E'FAIL  read pbalance returned 0 rows: policy or grant missing, or the table is empty\n';
    end if;
  exception when others then
    failed := true;
    report := report || E'FAIL  read pbalance: ' || sqlerrm || E'\n';
  end;

  -- Each of these must be refused with a permission error.
  begin
    execute 'insert into public.dept (dept_no, description, segment) values (''ZZ'', ''test'', ''test'')';
    failed := true; report := report || E'FAIL  INSERT was allowed\n';
  exception
    when insufficient_privilege then report := report || E'PASS  INSERT refused\n';
    when others then failed := true; report := report || E'FAIL  INSERT: unexpected error: ' || sqlerrm || E'\n';
  end;

  begin
    execute 'update public.dept set description = description where dept_no = ''ZZ''';
    failed := true; report := report || E'FAIL  UPDATE was allowed\n';
  exception
    when insufficient_privilege then report := report || E'PASS  UPDATE refused\n';
    when others then failed := true; report := report || E'FAIL  UPDATE: unexpected error: ' || sqlerrm || E'\n';
  end;

  begin
    execute 'delete from public.dept where dept_no = ''ZZ''';
    failed := true; report := report || E'FAIL  DELETE was allowed\n';
  exception
    when insufficient_privilege then report := report || E'PASS  DELETE refused\n';
    when others then failed := true; report := report || E'FAIL  DELETE: unexpected error: ' || sqlerrm || E'\n';
  end;

  begin
    execute 'truncate public.dept';
    failed := true; report := report || E'FAIL  TRUNCATE was allowed\n';
  exception
    when insufficient_privilege then report := report || E'PASS  TRUNCATE refused\n';
    when others then failed := true; report := report || E'FAIL  TRUNCATE: unexpected error: ' || sqlerrm || E'\n';
  end;

  begin
    execute 'create table public.chat_ro_probe (x int)';
    failed := true; report := report || E'FAIL  CREATE TABLE was allowed\n';
  exception
    when insufficient_privilege then report := report || E'PASS  CREATE TABLE refused\n';
    when others then failed := true; report := report || E'FAIL  CREATE TABLE: unexpected error: ' || sqlerrm || E'\n';
  end;

  begin
    execute 'select count(*) from auth.users';
    failed := true; report := report || E'FAIL  auth.users was readable\n';
  exception
    when insufficient_privilege then report := report || E'PASS  auth.users not readable\n';
    when others then failed := true; report := report || E'FAIL  auth.users: unexpected error: ' || sqlerrm || E'\n';
  end;

  report := report || case
    when failed then E'\nRESULT: FAILED. The role is misconfigured or too powerful. Do not use it.'
    else E'\nRESULT: ALL CHECKS PASSED'
  end;

  -- Always abort so that nothing above can ever be kept. The message is the report.
  raise exception E'\n%\n(this error is expected: it rolls everything back)', report;
end
$$;

rollback;
