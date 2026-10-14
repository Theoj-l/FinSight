-- FinSight synthetic AutoCount schema for Supabase (PostgreSQL)
-- Generated from FinSight_Data_Structure_v2. 17 tables, 93 columns.
-- Naming: snake_case, unquoted. Original AutoCount names preserved as COMMENT ON COLUMN.
-- Money is numeric, never float and never the Postgres money type.
-- Dates are date, never timestamptz, so a transaction cannot shift period across a timezone boundary.

begin;

-- Tier 1: ARInvoice  (Accounts Receivable)
create table ar_invoice (
  doc_key                bigint           not null,
  doc_no                 varchar(30)      not null,
  debtor_code            varchar(12)      not null,
  doc_date               date             not null,
  due_date               date             not null,
  description            varchar(80)     ,
  sales_agent            varchar(12)     ,
  branch_code            varchar(20)     ,
  local_net_total        numeric(19,4)    default 0 not null,
  local_payment_amt      numeric(19,4)    default 0 not null,
  outstanding            numeric(19,4)    default 0 not null,
  cancelled              boolean          not null,
  constraint pk_ar_invoice primary key (doc_key)
);

-- Tier 1: AccType  (GL & Reporting)
create table acc_type (
  acc_type               varchar(2)       not null,
  description            varchar(40)     ,
  is_bs_type             boolean          not null,
  constraint pk_acc_type primary key (acc_type)
);

-- Tier 1: Debtor  (Accounts Receivable)
create table debtor (
  acc_no                 varchar(12)      not null,
  company_name           varchar(100)    ,
  sales_agent            varchar(12)     ,
  credit_limit           numeric(19,4)   ,
  display_term           varchar(30)      not null,
  constraint pk_debtor primary key (acc_no)
);

-- Tier 1: Dept  (Reference)
create table dept (
  dept_no                varchar(10)      not null,
  description            varchar(40)     ,
  segment                varchar(20)      not null,
  constraint pk_dept primary key (dept_no),
  constraint dept_segment_check check (segment in ('Machining', 'Bulk'))
);

-- Tier 1: FiscalYear  (GL & Reporting)
create table fiscal_year (
  fiscal_year_name       varchar(20)      not null,
  from_date              date             not null,
  to_date                date             not null,
  is_active              boolean          not null,
  constraint pk_fiscal_year primary key (fiscal_year_name)
);

-- Tier 1: GLDTL  (GL & Reporting)
create table gl_dtl (
  gl_dtl_key             bigint           not null,
  gl_trx_id              bigint           not null,
  acc_no                 varchar(12)      not null,
  dept_no                varchar(10)      not null,
  trans_date             date             not null,
  description            varchar(100)    ,
  journal_type           varchar(10)      not null,
  source_type            varchar(1)      ,
  ref_no1                varchar(30)     ,
  home_dr                numeric(19,4)    default 0 not null,
  home_cr                numeric(19,4)    default 0 not null,
  constraint pk_gl_dtl primary key (gl_dtl_key)
);

-- Tier 1: GLMast  (GL & Reporting)
create table gl_mast (
  acc_no                 varchar(12)      not null,
  parent_acc_no          varchar(12)     ,
  description            varchar(100)    ,
  acc_type               varchar(2)       not null,
  constraint pk_gl_mast primary key (acc_no)
);

-- Tier 1: PBalance  (GL & Reporting)
create table pbalance (
  period_no              integer          not null,
  acc_no                 varchar(12)      not null,
  dept_no                varchar(10)      not null,
  home_dr                numeric(19,4)    default 0 not null,
  home_cr                numeric(19,4)    default 0 not null,
  constraint pk_pbalance primary key (period_no, acc_no, dept_no)
);

-- Tier 1: PLFormat  (GL & Reporting)
create table pl_format (
  seq                    integer          not null,
  row_type               varchar(1)       not null,
  acc_type               varchar(2)      ,
  description            varchar(100)    ,
  credit_as_positive     boolean          not null,
  constraint pk_pl_format primary key (seq)
);

-- Tier 2: Branch  (Reference)
create table branch (
  branch_code            varchar(20)      not null,
  branch_name            varchar(100)    ,
  is_active              boolean          not null,
  constraint pk_branch primary key (branch_code)
);

-- Tier 2: Budget  (GL & Reporting)
create table budget (
  budget_key             bigint           not null,
  budget_name            varchar(20)      not null,
  constraint pk_budget primary key (budget_key)
);

-- Tier 2: BudgetPBalance  (GL & Reporting)
create table budget_pbalance (
  budget_key             bigint           not null,
  period_no              integer          not null,
  acc_no                 varchar(12)      not null,
  dept_no                varchar(10)      not null,
  amount                 numeric(19,4)    default 0 not null,
  constraint pk_budget_pbalance primary key (budget_key, period_no, acc_no, dept_no)
);

-- Tier 2: IV  (Sales)
create table iv (
  doc_key                bigint           not null,
  doc_no                 varchar(30)      not null,
  debtor_code            varchar(12)      not null,
  doc_date               date             not null,
  sales_agent            varchar(12)     ,
  branch_code            varchar(20)     ,
  description            varchar(80)     ,
  local_ex_tax           numeric(19,4)    default 0 not null,
  local_net_total        numeric(19,4)    default 0 not null,
  local_total_cost       numeric(20,6)    default 0 not null,
  cancelled              boolean          not null,
  constraint pk_iv primary key (doc_key)
);

-- Tier 2: IVDTL  (Sales)
create table iv_dtl (
  dtl_key                bigint           not null,
  doc_key                bigint           not null,
  seq                    integer          not null,
  item_code              varchar(30)     ,
  description            varchar(100)    ,
  dept_no                varchar(10)      not null,
  qty                    numeric(20,6)    default 0 not null,
  unit_price             numeric(20,6)    default 0 not null,
  local_sub_total        numeric(19,4)    default 0 not null,
  local_total_cost       numeric(20,6)    default 0 not null,
  constraint pk_iv_dtl primary key (dtl_key)
);

-- Tier 2: Item  (Sales)
create table item (
  item_code              varchar(30)      not null,
  description            varchar(100)    ,
  item_group             varchar(8)      ,
  is_active              boolean          not null,
  constraint pk_item primary key (item_code)
);

-- Tier 2: ItemGroup  (Sales)
create table item_group (
  item_group             varchar(8)       not null,
  description            varchar(40)     ,
  sales_code             varchar(12)     ,
  purchase_code          varchar(12)     ,
  constraint pk_item_group primary key (item_group)
);

-- Tier 2: SalesAgent  (Reference)
create table sales_agent (
  sales_agent            varchar(12)      not null,
  description            varchar(40)     ,
  is_active              boolean          not null,
  constraint pk_sales_agent primary key (sales_agent)
);

-- Foreign keys
alter table gl_dtl add constraint fk_gl_dtl_acc_no foreign key (acc_no) references gl_mast(acc_no);
alter table gl_dtl add constraint fk_gl_dtl_dept_no foreign key (dept_no) references dept(dept_no);
alter table pbalance add constraint fk_pbalance_acc_no foreign key (acc_no) references gl_mast(acc_no);
alter table pbalance add constraint fk_pbalance_dept_no foreign key (dept_no) references dept(dept_no);
alter table gl_mast add constraint fk_gl_mast_acc_type foreign key (acc_type) references acc_type(acc_type);
alter table gl_mast add constraint fk_gl_mast_parent_acc_no foreign key (parent_acc_no) references gl_mast(acc_no);
alter table pl_format add constraint fk_pl_format_acc_type foreign key (acc_type) references acc_type(acc_type);
alter table budget_pbalance add constraint fk_budget_pbalance_acc_no foreign key (acc_no) references gl_mast(acc_no);
alter table budget_pbalance add constraint fk_budget_pbalance_budget_key foreign key (budget_key) references budget(budget_key);
alter table ar_invoice add constraint fk_ar_invoice_debtor_code foreign key (debtor_code) references debtor(acc_no);
alter table ar_invoice add constraint fk_ar_invoice_sales_agent foreign key (sales_agent) references sales_agent(sales_agent);
alter table ar_invoice add constraint fk_ar_invoice_branch_code foreign key (branch_code) references branch(branch_code);
alter table debtor add constraint fk_debtor_sales_agent foreign key (sales_agent) references sales_agent(sales_agent);
alter table iv add constraint fk_iv_debtor_code foreign key (debtor_code) references debtor(acc_no);
alter table iv_dtl add constraint fk_iv_dtl_doc_key foreign key (doc_key) references iv(doc_key);
alter table iv_dtl add constraint fk_iv_dtl_item_code foreign key (item_code) references item(item_code);
alter table iv_dtl add constraint fk_iv_dtl_dept_no foreign key (dept_no) references dept(dept_no);
alter table item add constraint fk_item_item_group foreign key (item_group) references item_group(item_group);
alter table item_group add constraint fk_item_group_sales_code foreign key (sales_code) references gl_mast(acc_no);

-- Indexes for the dashboard and drill-down access paths
create index ix_pbalance_period_acc on pbalance (period_no, acc_no);
create index ix_gl_dtl_acc_date on gl_dtl (acc_no, trans_date);
create index ix_gl_dtl_trx on gl_dtl (gl_trx_id);
create index ix_gl_dtl_dept_date on gl_dtl (dept_no, trans_date);
create index ix_ar_invoice_debtor_due on ar_invoice (debtor_code, due_date);
create index ix_iv_dtl_doc on iv_dtl (doc_key);
create index ix_iv_dtl_item on iv_dtl (item_code);

-- Traceability back to the AutoCount source schema
comment on column ar_invoice.doc_key is 'AutoCount ARInvoice.DocKey. PK.';
comment on column ar_invoice.doc_no is 'AutoCount ARInvoice.DocNo. Invoice number.';
comment on column ar_invoice.debtor_code is 'AutoCount ARInvoice.DebtorCode. FK to Debtor.AccNo.';
comment on column ar_invoice.doc_date is 'AutoCount ARInvoice.DocDate. Invoice date.';
comment on column ar_invoice.due_date is 'AutoCount ARInvoice.DueDate. Drives days-overdue and the aging buckets.';
comment on column ar_invoice.description is 'AutoCount ARInvoice.Description. Invoice narrative.';
comment on column ar_invoice.sales_agent is 'AutoCount ARInvoice.SalesAgent. FK to SalesAgent.';
comment on column ar_invoice.branch_code is 'AutoCount ARInvoice.BranchCode. FK to Branch.';
comment on column ar_invoice.local_net_total is 'AutoCount ARInvoice.LocalNetTotal. Invoice value in reporting currency.';
comment on column ar_invoice.local_payment_amt is 'AutoCount ARInvoice.LocalPaymentAmt. Amount received to date. Derive, never generate independently.';
comment on column ar_invoice.outstanding is 'AutoCount ARInvoice.Outstanding. LocalNetTotal minus LocalPaymentAmt. Derive.';
comment on column ar_invoice.cancelled is 'AutoCount ARInvoice.Cancelled. Exclude cancelled invoices from aging.';
comment on column acc_type.acc_type is 'AutoCount AccType.AccType. PK.';
comment on column acc_type.description is 'AutoCount AccType.Description. Revenue, Cost of Sales, Expense and so on.';
comment on column acc_type.is_bs_type is 'AutoCount AccType.IsBSType. TRUE = balance sheet, FALSE = P&L. Your filter for the statement.';
comment on column debtor.acc_no is 'AutoCount Debtor.AccNo. PK. Debtor code. ARInvoice.DebtorCode joins here.';
comment on column debtor.company_name is 'AutoCount Debtor.CompanyName. Customer name for the dashboard and assistant answers.';
comment on column debtor.sales_agent is 'AutoCount Debtor.SalesAgent. FK to SalesAgent. Who owns the relationship.';
comment on column debtor.credit_limit is 'AutoCount Debtor.CreditLimit. Context for the overdue and credit-exposure view.';
comment on column debtor.display_term is 'AutoCount Debtor.DisplayTerm. Payment terms as text, which is why the Terms table can be dropped.';
comment on column dept.dept_no is 'AutoCount Dept.DeptNo. PK. Business unit code.';
comment on column dept.description is 'AutoCount Dept.Description. Business unit name.';
comment on column dept.segment is 'Not in AutoCount. Added for FinSight reporting: groups business units into Machining (bespoke fabrication/engineering/maintenance work) vs Bulk (rental, haulage, logistics, trading, corporate/unallocated).';
comment on column fiscal_year.fiscal_year_name is 'AutoCount FiscalYear.FiscalYearName. Label, for example FY2025.';
comment on column fiscal_year.from_date is 'AutoCount FiscalYear.FromDate. Year start. Anchors the PeriodNo to month mapping.';
comment on column fiscal_year.to_date is 'AutoCount FiscalYear.ToDate. Year end.';
comment on column fiscal_year.is_active is 'AutoCount FiscalYear.IsActive. Current year flag.';
comment on column gl_dtl.gl_dtl_key is 'AutoCount GLDTL.GLDtlKey. PK.';
comment on column gl_dtl.gl_trx_id is 'AutoCount GLDTL.GLTrxID. Journal batch key. Required to assert that each journal balances. ADDED after the Postgres pre-flight check; without it the FS-12 validation harness cannot group lines into documents.';
comment on column gl_dtl.acc_no is 'AutoCount GLDTL.AccNo. FK to GLMast.';
comment on column gl_dtl.dept_no is 'AutoCount GLDTL.DeptNo. FK to Dept.';
comment on column gl_dtl.trans_date is 'AutoCount GLDTL.TransDate. Posting date. Aggregated to PeriodNo for PBalance.';
comment on column gl_dtl.description is 'AutoCount GLDTL.Description. Line narrative, shown in drill-down.';
comment on column gl_dtl.journal_type is 'AutoCount GLDTL.JournalType. Sales, purchase, cash, general. Useful for explaining a movement.';
comment on column gl_dtl.source_type is 'AutoCount GLDTL.SourceType. Source document type, for drill-through.';
comment on column gl_dtl.ref_no1 is 'AutoCount GLDTL.RefNo1. Source document number, for drill-through.';
comment on column gl_dtl.home_dr is 'AutoCount GLDTL.HomeDR. Debit in reporting currency.';
comment on column gl_dtl.home_cr is 'AutoCount GLDTL.HomeCR. Credit in reporting currency.';
comment on column gl_mast.acc_no is 'AutoCount GLMast.AccNo. PK. Account number.';
comment on column gl_mast.parent_acc_no is 'AutoCount GLMast.ParentAccNo. Self-join for account hierarchy.';
comment on column gl_mast.description is 'AutoCount GLMast.Description. Account name shown on the statement.';
comment on column gl_mast.acc_type is 'AutoCount GLMast.AccType. FK to AccType. The classification that drives every roll-up.';
comment on column pbalance.period_no is 'AutoCount PBalance.PeriodNo. PK part. FK to FiscalYear for dates.';
comment on column pbalance.acc_no is 'AutoCount PBalance.AccNo. PK part. FK to GLMast.';
comment on column pbalance.dept_no is 'AutoCount PBalance.DeptNo. PK part. FK to Dept. Business unit dimension.';
comment on column pbalance.home_dr is 'AutoCount PBalance.HomeDR. Debit movement in reporting currency.';
comment on column pbalance.home_cr is 'AutoCount PBalance.HomeCR. Credit movement in reporting currency.';
comment on column pl_format.seq is 'AutoCount PLFormat.Seq. Row order down the statement.';
comment on column pl_format.row_type is 'AutoCount PLFormat.RowType. Account row, subtotal row, or heading row.';
comment on column pl_format.acc_type is 'AutoCount PLFormat.AccType. FK to AccType. Which accounts feed this row.';
comment on column pl_format.description is 'AutoCount PLFormat.Description. Row label.';
comment on column pl_format.credit_as_positive is 'AutoCount PLFormat.CreditAsPositive. Sign convention. Revenue is a credit but shows positive.';
comment on column branch.branch_code is 'AutoCount Branch.BranchCode. PK.';
comment on column branch.branch_name is 'AutoCount Branch.BranchName. Branch name.';
comment on column branch.is_active is 'AutoCount Branch.IsActive. Active flag.';
comment on column budget.budget_key is 'AutoCount Budget.BudgetKey. PK.';
comment on column budget.budget_name is 'AutoCount Budget.BudgetName. Scenario name.';
comment on column budget_pbalance.budget_key is 'AutoCount BudgetPBalance.BudgetKey. FK to Budget.';
comment on column budget_pbalance.period_no is 'AutoCount BudgetPBalance.PeriodNo. PK part.';
comment on column budget_pbalance.acc_no is 'AutoCount BudgetPBalance.AccNO. PK part. FK to GLMast. Note AutoCount''s capitalisation here is AccNO, not AccNo.';
comment on column budget_pbalance.dept_no is 'AutoCount BudgetPBalance.DeptNo. PK part. FK to Dept.';
comment on column budget_pbalance.amount is 'AutoCount BudgetPBalance.Amount. Budgeted amount. Single signed value, unlike the DR/CR pair in PBalance.';
comment on column iv.doc_key is 'AutoCount IV.DocKey. PK.';
comment on column iv.doc_no is 'AutoCount IV.DocNo. Invoice number.';
comment on column iv.debtor_code is 'AutoCount IV.DebtorCode. FK to Debtor.AccNo.';
comment on column iv.doc_date is 'AutoCount IV.DocDate. Invoice date.';
comment on column iv.sales_agent is 'AutoCount IV.SalesAgent. FK to SalesAgent.';
comment on column iv.branch_code is 'AutoCount IV.BranchCode. FK to Branch.';
comment on column iv.description is 'AutoCount IV.Description. Header narrative.';
comment on column iv.local_ex_tax is 'AutoCount IV.LocalExTax. Revenue excluding tax, in reporting currency. This is the figure that must tie to the GL revenue posting. Note there is no LocalTotal column on IV.';
comment on column iv.local_net_total is 'AutoCount IV.LocalNetTotal. Total including tax.';
comment on column iv.local_total_cost is 'AutoCount IV.LocalTotalCost. Header-level COGS. Cross-check against the sum of IVDTL.LocalTotalCost.';
comment on column iv.cancelled is 'AutoCount IV.Cancelled. Exclude cancelled invoices.';
comment on column iv_dtl.dtl_key is 'AutoCount IVDTL.DtlKey. PK.';
comment on column iv_dtl.doc_key is 'AutoCount IVDTL.DocKey. FK to IV.';
comment on column iv_dtl.seq is 'AutoCount IVDTL.Seq. Line order.';
comment on column iv_dtl.item_code is 'AutoCount IVDTL.ItemCode. FK to Item.';
comment on column iv_dtl.description is 'AutoCount IVDTL.Description. Line description.';
comment on column iv_dtl.dept_no is 'AutoCount IVDTL.DeptNo. FK to Dept. Business unit at line level.';
comment on column iv_dtl.qty is 'AutoCount IVDTL.Qty. Quantity sold.';
comment on column iv_dtl.unit_price is 'AutoCount IVDTL.UnitPrice. Price per unit.';
comment on column iv_dtl.local_sub_total is 'AutoCount IVDTL.LocalSubTotal. Line revenue. Sum of these must tie to IV.LocalExTax.';
comment on column iv_dtl.local_total_cost is 'AutoCount IVDTL.LocalTotalCost. Line COGS. Enables gross margin by product.';
comment on column item.item_code is 'AutoCount Item.ItemCode. PK.';
comment on column item.description is 'AutoCount Item.Description. Product name.';
comment on column item.item_group is 'AutoCount Item.ItemGroup. FK to ItemGroup.';
comment on column item.is_active is 'AutoCount Item.IsActive. Active product flag.';
comment on column item_group.item_group is 'AutoCount ItemGroup.ItemGroup. PK.';
comment on column item_group.description is 'AutoCount ItemGroup.Description. Category name.';
comment on column item_group.sales_code is 'AutoCount ItemGroup.SalesCode. GL revenue account this group posts to. The tie-back to GLDTL.';
comment on column item_group.purchase_code is 'AutoCount ItemGroup.PurchaseCode. GL cost account this group posts to.';
comment on column sales_agent.sales_agent is 'AutoCount SalesAgent.SalesAgent. PK.';
comment on column sales_agent.description is 'AutoCount SalesAgent.Description. Agent name.';
comment on column sales_agent.is_active is 'AutoCount SalesAgent.IsActive. Active flag.';

-- Supabase: deny anonymous access. FastAPI connects with the service role or a direct
-- Postgres connection string, so no policies are needed. Without this, every table is
-- world-readable through PostgREST using the anon key.
alter table ar_invoice enable row level security;
alter table acc_type enable row level security;
alter table debtor enable row level security;
alter table dept enable row level security;
alter table fiscal_year enable row level security;
alter table gl_dtl enable row level security;
alter table gl_mast enable row level security;
alter table pbalance enable row level security;
alter table pl_format enable row level security;
alter table branch enable row level security;
alter table budget enable row level security;
alter table budget_pbalance enable row level security;
alter table iv enable row level security;
alter table iv_dtl enable row level security;
alter table item enable row level security;
alter table item_group enable row level security;
alter table sales_agent enable row level security;

-- ---------------------------------------------------------------------------
-- FinSight application tables (not AutoCount): anomaly-detection output.
-- Written only by ml-service (app/anomaly/score.py); read by web/ through Prisma.
-- No foreign keys into the ledger tables, so `python -m datagen --load`
-- (truncate ... cascade) never empties them; it rescores them instead.
-- ---------------------------------------------------------------------------
create table anomaly_run (
  run_id                 bigint           generated always as identity,
  started_at             timestamptz      default now() not null,
  finished_at            timestamptz     ,
  status                 varchar(10)      default 'running' not null,
  triggered_by           varchar(20)      not null,
  model_version          varchar(20)      not null,
  data_through           integer         ,
  scored_through         integer         ,
  n_alerts               integer         ,
  n_new                  integer         ,
  error                  text            ,
  constraint pk_anomaly_run primary key (run_id),
  constraint ck_anomaly_run_status check (status in ('running', 'ok', 'failed'))
);

create table anomaly_alert (
  unit_kind              varchar(4)       not null,
  unit_key               varchar(12)      not null,
  period_no              integer          not null,
  score                  double precision not null,
  reasons                jsonb            default '[]' not null,
  evidence               jsonb,
  model_version          varchar(20)      not null,
  first_flagged_at       timestamptz      default now() not null,
  run_id                 bigint           not null,
  constraint pk_anomaly_alert primary key (unit_kind, unit_key, period_no),
  constraint ck_anomaly_alert_unit_kind check (unit_kind in ('dept', 'acc', 'cust')),
  constraint fk_anomaly_alert_run_id foreign key (run_id) references anomaly_run(run_id)
);
create index ix_anomaly_alert_period on anomaly_alert (period_no);

comment on table anomaly_run is 'One row per anomaly scoring run. The latest ok run says how fresh anomaly_alert is.';
comment on column anomaly_run.status is 'running, ok or failed. On failure anomaly_alert keeps the previous run''s alerts.';
comment on column anomaly_run.triggered_by is 'What started the run: cli (cron), api (POST /anomalies/rescore) or datagen (after a data load).';
comment on column anomaly_run.model_version is 'Trained model that produced the alerts, e.g. v1 (ml-service/models/anomaly/<version>).';
comment on column anomaly_run.data_through is 'Latest period_no present in the ledger when the run started.';
comment on column anomaly_run.scored_through is 'Latest period_no scored. Only closed months are scored; a month still in progress is provisional.';
comment on column anomaly_run.n_alerts is 'Alerts in anomaly_alert after the run.';
comment on column anomaly_run.n_new is 'Alerts first raised by this run (not present before it).';
comment on column anomaly_run.error is 'Exception text when status = failed.';
comment on table anomaly_alert is 'Current anomaly alerts, replaced by every successful scoring run. One row per flagged unit-month.';
comment on column anomaly_alert.unit_kind is 'dept = business unit (key dept_no), acc = corporate expense account (key acc_no on dept CP), cust = customer (key debtor acc_no).';
comment on column anomaly_alert.unit_key is 'dept_no, acc_no or debtor code, depending on unit_kind. Not a foreign key: it points at different tables.';
comment on column anomaly_alert.period_no is 'Month flagged, YYYYMM.';
comment on column anomaly_alert.score is 'Model probability that the unit-month is anomalous, 0 to 1. Rows exist only at or above the alert threshold.';
comment on column anomaly_alert.evidence is 'Versioned review evidence, comparison values, source IDs and as-of snapshots; not model inputs.';
comment on column anomaly_alert.reasons is 'JSON array of plain-English evidence strings, strongest first. Safe to show as-is.';
comment on column anomaly_alert.first_flagged_at is 'When this unit-month was first flagged. Kept across reruns, so (unit_kind, unit_key, period_no) is a stable notification id.';
comment on column anomaly_alert.run_id is 'The run that last confirmed this alert.';

alter table anomaly_run enable row level security;
alter table anomaly_alert enable row level security;

-- ---------------------------------------------------------------------------
-- FinSight application tables (not AutoCount): revenue / cost / profit forecasts.
-- Written only by ml-service (app/forecast/run.py, monthly); read by web/ through
-- Prisma (app/dashboard/data/forecast.ts). Every run is kept. No foreign keys into
-- the ledger tables, so `python -m datagen --load` never empties them.
-- ---------------------------------------------------------------------------
create table forecast_run (
  run_id                 bigint           generated always as identity,
  started_at             timestamptz      default now() not null,
  finished_at            timestamptz     ,
  status                 varchar(10)      default 'running' not null,
  triggered_by           varchar(20)      not null,
  model_version          varchar(20)      not null,
  data_through           integer         ,
  history_through        integer         ,
  horizon                smallint        ,
  n_series               integer         ,
  summary                jsonb           ,
  error                  text            ,
  constraint pk_forecast_run primary key (run_id),
  constraint ck_forecast_run_status check (status in ('running', 'ok', 'failed'))
);

create table forecast_value (
  run_id                 bigint           not null,
  kind                   varchar(8)       not null,
  dept_no                varchar(10)      not null,
  metric                 varchar(8)       not null,
  origin                 integer          not null,
  period_no              integer          not null,
  horizon                smallint         not null,
  yhat                   double precision not null,
  actual                 double precision,
  method                 varchar(20)      not null,
  constraint pk_forecast_value primary key (run_id, kind, dept_no, metric, origin, period_no),
  constraint ck_forecast_value_kind check (kind in ('forecast', 'backtest')),
  constraint ck_forecast_value_metric check (metric in ('revenue', 'cost', 'profit')),
  constraint ck_forecast_value_horizon check (horizon between 1 and 24),
  constraint fk_forecast_value_run_id foreign key (run_id) references forecast_run(run_id) on delete cascade
);

comment on table forecast_run is 'One row per forecast run (monthly cron, POST /forecast/run or after a datagen load). The latest ok run is the current forecast.';
comment on column forecast_run.status is 'running, ok or failed. A failed run stores no values; readers use the latest ok run.';
comment on column forecast_run.triggered_by is 'What started the run: cli (cron), api (POST /forecast/run) or datagen (after a data load).';
comment on column forecast_run.model_version is 'Selected forecaster, e.g. v1 (ml-service/models/forecast/<version>/config.json).';
comment on column forecast_run.data_through is 'Latest period_no present in pbalance when the run started.';
comment on column forecast_run.history_through is 'Last closed month the forecast was made from (a month in progress is never used). Forecasts start the month after.';
comment on column forecast_run.horizon is 'Months forecast ahead of history_through.';
comment on column forecast_run.n_series is 'Department x metric series forecast.';
comment on column forecast_run.summary is 'JSON: the methods used, the 15% MAPE target, and company-level accuracy of 1-month-ahead backtest forecasts over the last 12 closed months (mape, wape, mae, rmse, meets_target per metric).';
comment on column forecast_run.error is 'Exception text when status = failed.';
comment on table forecast_value is 'Forecast and backtest values per department, metric and month. Selections of departments (All units, a segment) are sums of these rows.';
comment on column forecast_value.kind is 'forecast = the months after history_through; backtest = past months re-forecast from the data before them, with the actual, for accuracy and the band.';
comment on column forecast_value.dept_no is 'Department (business unit or CP). Not a foreign key, so reloading the ledger leaves forecasts in place.';
comment on column forecast_value.metric is 'revenue (RE, credit - debit), cost (CS + EX, debit - credit) or profit (revenue - cost + other income; derived, never forecast on its own).';
comment on column forecast_value.origin is 'Last month of data the forecast was made from, YYYYMM.';
comment on column forecast_value.period_no is 'Month forecast, YYYYMM.';
comment on column forecast_value.horizon is 'Months ahead of origin (1 = next month).';
comment on column forecast_value.yhat is 'Forecast value, S$ (home currency).';
comment on column forecast_value.actual is 'Actual value for backtest rows; null for forecast rows.';
comment on column forecast_value.method is 'Method that produced the value (e.g. holt_winters, or snaive when history is short); derived for profit.';

alter table forecast_run enable row level security;
alter table forecast_value enable row level security;

commit;
