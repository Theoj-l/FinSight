-- Generator artefacts. NOT part of the AutoCount model. Safe to drop entirely
-- and regenerate: `drop schema datagen cascade;`
-- Applied automatically by `python -m datagen --load`.

create schema if not exists datagen;

comment on schema datagen is
  'FinSight synthetic-data generator artefacts (labels, run metadata). '
  'Not part of the AutoCount ledger. Prisma does not introspect this schema.';

create table if not exists datagen.run (
  run_id       bigint generated always as identity primary key,
  generated_at timestamptz not null default now(),
  seed         bigint  not null,
  phase        int     not null,
  from_period  int     not null,     -- YYYYMM
  to_period    int     not null,     -- YYYYMM
  row_counts   jsonb   not null,
  notes        text
);

create table if not exists datagen.anomaly_log (
  anomaly_id        varchar(8)  primary key,
  category          varchar(20) not null,   -- revenue | margin | expense | posting_error | receivables
  subtype           varchar(40) not null,
  severity          varchar(10) not null,   -- low | medium | high
  period_start      int         not null,   -- YYYYMM
  period_end        int         not null,   -- YYYYMM
  affected_table    varchar(30),
  affected_dept     varchar(10),            -- dept_no, when scoped to a business unit
  affected_account  varchar(12),            -- acc_no, when scoped to an account
  affected_customer varchar(12),            -- debtor.acc_no, when scoped to a customer
  baseline_amount   numeric(19,4),          -- expected value (amount or ratio)
  actual_amount     numeric(19,4),          -- injected value
  deviation_pct     numeric(12,2),
  description       text not null,
  detection_hint    text not null
);

comment on table datagen.anomaly_log is
  'Ground-truth labels for anomalies injected into the synthetic dataset. '
  'Join on period_no / dept_no / acc_no / debtor_code to score detection models.';

alter table datagen.run          enable row level security;
alter table datagen.anomaly_log  enable row level security;

truncate datagen.run;   -- run metadata is replaced on every load
