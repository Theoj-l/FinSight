/** Real database verification. Every test write is enclosed in one transaction
 * that is deliberately rolled back. No model is trained or scored.
 * Run from web: node --env-file=.env scripts/verify-financial-db.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { build } from "esbuild";
import { PrismaClient } from "@prisma/client";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL,
  log: [],
});
const output = await build({
  stdin: {
    contents: `export * from './lib/financial/data'; export * from './lib/financial/settings-data'; export * from './lib/financial/presentation'; export * from './lib/financial/alerts'; export * from './lib/financial/types';`,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  packages: "external",
  alias: { "@": root },
  plugins: [
    {
      name: "transaction-bound-client",
      setup(b) {
        b.onResolve({ filter: /^(server-only|@\/lib\/db)$/ }, (args) => ({
          path: args.path,
          namespace: "verification",
        }));
        b.onLoad({ filter: /.*/, namespace: "verification" }, (args) => ({
          contents:
            args.path === "server-only"
              ? ""
              : `export const prisma = new Proxy({}, {get(_, key) { const value = globalThis.__financialVerificationDb[key]; return typeof value === 'function' ? value.bind(globalThis.__financialVerificationDb) : value; }});`,
        }));
      },
    },
  ],
});
const verificationModule = { exports: {} };
new Function("require", "module", "exports", output.outputFiles[0].text)(
  createRequire(resolve(root, "package.json")),
  verificationModule,
  verificationModule.exports,
);
const api = verificationModule.exports;
const rollback = new Error("deliberate verification rollback");
const tables = [
  "pbalance",
  "gl_dtl",
  "budget",
  "budget_pbalance",
  "forecast_run",
  "forecast_value",
  "anomaly_run",
  "anomaly_alert",
  "financial_settings",
  "financial_manual_forecast",
];
async function fingerprints() {
  const result = {};
  for (const table of tables) {
    // Table names are a fixed allowlist, never user input. Do not print records.
    result[table] = await prisma.$queryRawUnsafe(
      `SELECT count(*)::text AS count, COALESCE(sum(hashtextextended(row_to_json(t)::text, 0)::numeric), 0)::text AS fingerprint FROM ${table} t`,
    );
  }
  return result;
}
let passed = 0;
let before;
function check(name, fn) {
  fn();
  passed++;
  console.log(`PASS ${name}`);
}
try {
  before = await fingerprints();
  await prisma.$transaction(
    async (tx) => {
      globalThis.__financialVerificationDb = new Proxy(tx, {
        get(target, key) {
          return key === "$transaction" ? async (fn) => fn(tx) : target[key];
        },
      });
      const latest = await tx.pbalance.findFirst({
        orderBy: { period_no: "desc" },
        select: { period_no: true, dept_no: true },
      });
      assert(latest, "Verification requires an existing ledger month.");
      const period = latest.period_no,
        department = latest.dept_no;
      const scope = { period, departmentIds: [department] };
      const initial = await api.getFinancialBundle(scope);
      check(
        "stored ledger comparisons are serializable and have exact actual amounts",
        () => {
          assert(initial);
          assert.doesNotThrow(() => JSON.stringify(initial));
          assert.notEqual(
            initial.sources.previous[period].metrics.netProfit.actual,
            null,
          );
        },
      );

      const rules = api.defaultRules();
      rules.revenue.tolerance = 7;
      await api.writePlanningSettings(
        { kind: "rules", rules },
        "verification-rollback",
      );
      await api.writePlanningSettings(
        {
          kind: "manual",
          department,
          period,
          revenue: "123.4567",
          netProfit: "-25",
        },
        "verification-rollback",
      );
      let bundle = await api.getFinancialBundle(scope);
      check(
        "manual save is visible to the real loader and leaves actual ledger values unchanged",
        () => {
          assert.equal(
            bundle.sources.manual[period].metrics.revenue.reference,
            "123.4567",
          );
          assert.equal(
            bundle.sources.manual[period].metrics.netProfit.reference,
            "-25.0000",
          );
          for (const series of Object.values(bundle.sources))
            assert.equal(
              series[period].metrics.netProfit.actual,
              initial.sources.previous[period].metrics.netProfit.actual,
            );
          assert.equal(bundle.rules.revenue.tolerance, 7);
        },
      );
      await api.writePlanningSettings(
        { kind: "manual", department, period, revenue: null, netProfit: null },
        "verification-rollback",
      );
      bundle = await api.getFinancialBundle(scope);
      check(
        "clearing a manual forecast is unavailable, never substituted",
        () =>
          assert.equal(
            bundle.sources.manual[period].metrics.revenue.reference,
            null,
          ),
      );

      await api.writePlanningSettings(
        { kind: "scenario", name: "Verification only" },
        "verification-rollback",
      );
      const scenario = await tx.budget.findFirst({
        orderBy: { budget_key: "desc" },
      });
      const accounts = await tx.gl_mast.findMany({
        where: { acc_type: { in: ["RE", "OI", "CS", "EX"] } },
      });
      const first = new Set();
      const entries = accounts.map((a) => {
        const amount = first.has(a.acc_type)
          ? null
          : { RE: "200", OI: "5", CS: "30", EX: "20" }[a.acc_type];
        first.add(a.acc_type);
        return { account: a.acc_no, amount };
      });
      await api.writePlanningSettings(
        {
          kind: "budget",
          department,
          period,
          budgetId: scenario.budget_key.toString(),
          entries,
        },
        "verification-rollback",
      );
      await api.writePlanningSettings(
        {
          kind: "source",
          source: "budget",
          budgetId: scenario.budget_key.toString(),
        },
        "verification-rollback",
      );
      bundle = await api.getFinancialBundle(scope);
      const selected = bundle.budgetSources[scenario.budget_key.toString()];
      check(
        "budget save derives consistent subtotals and Home uses its saved scenario",
        () => {
          assert.equal(selected[period].metrics.revenue.reference, "200.0000");
          assert.equal(
            selected[period].metrics.grossProfit.reference,
            "170.0000",
          );
          assert.equal(
            selected[period].metrics.netProfit.reference,
            "155.0000",
          );
          assert.equal(bundle.notificationSource, "budget");
          assert.equal(
            bundle.notificationBudgetId,
            scenario.budget_key.toString(),
          );
          const cards = api.comparisonKpis(bundle, "budget", selected);
          assert.equal(cards.metrics[0].prior, "200.0000");
          for (const alert of api.financialAlerts(cards))
            assert(alert.comparison.breach && alert.comparison.unfavorable);
        },
      );
      const settings = await api.readPlanningSettings(
        department,
        period,
        scenario.budget_key.toString(),
      );
      check(
        "Settings reads budget income with the displayed positive sign",
        () =>
          assert.equal(
            settings.entries[accounts.find((a) => a.acc_type === "RE").acc_no],
            "200",
          ),
      );
      check(
        "auto comparisons keep unsupported metrics empty and disclose causal provenance",
        () => {
          const auto = bundle.sources.auto[period];
          for (const m of [
            "grossProfit",
            "costOfSales",
            "operatingExpenses",
            "grossMargin",
            "netMargin",
          ])
            assert.equal(auto.metrics[m].reference, null);
          for (const m of ["revenue", "netProfit"])
            assert.match(
              auto.metrics[m].note,
              /Reconstructed forecast|Archived forecast|No complete, causal forecast/,
            );
        },
      );
      const future = await api.getFinancialBundle({
        ...scope,
        period: api.addMonth(period, 24),
      });
      check(
        "future months never manufacture actual values or deviations",
        () => {
          for (const series of Object.values(future.sources))
            for (const c of Object.values(series[future.period].metrics)) {
              assert.equal(c.actual, null);
              assert.equal(c.percentage, null);
              assert.equal(c.breach, false);
            }
        },
      );
      await assert.rejects(
        api.getFinancialBundle({ ...scope, branchCodes: ["unsupported"] }),
        /Branch-level/,
      );
      passed++;
      console.log("PASS unsupported branch coverage is refused");
      for (const businessType of ["Machining", "Bulk"]) {
        const summary = await api.readPlanningSettings(undefined, period, undefined, businessType);
        check(`${businessType} summary is read-only and excludes inactive placeholders`, () => {
          assert.equal(summary.readOnly, true);
          assert(summary.summary.units.length > 0);
          assert(!summary.summary.units.includes("NA"));
          if (businessType === "Bulk") assert(summary.summary.units.includes("CP"));
        });
        for (const unit of summary.summary.units) await api.writePlanningSettings({kind:"manual",department:unit,period,revenue:"100",netProfit:"10"}, "verification-rollback");
        const complete = await api.readPlanningSettings(undefined, period, undefined, businessType);
        check(`${businessType} summary reflects unit saves with exact summed totals`, () => {
          assert.equal(Number(complete.summary.manual.metrics.revenue.reference),100 * summary.summary.units.length);
          assert.equal(Number(complete.summary.manual.metrics.netProfit.reference),10 * summary.summary.units.length);
        });
        const unit = summary.summary.units[0];
        await api.writePlanningSettings({kind:"manual",department:unit,period,revenue:null,netProfit:null}, "verification-rollback");
        const incomplete = await api.readPlanningSettings(undefined, period, undefined, businessType);
        check(`${businessType} missing unit prevents partial totals and is named`, () => {
          assert.equal(incomplete.summary.manual.metrics.revenue.reference,null);
          assert(incomplete.summary.manual.provenance.join(" ").includes(unit));
        });
      }
      await assert.rejects(api.readPlanningSettings("EN",period,undefined,"Bulk"), /does not belong/);
      passed++;
      throw rollback;
    },
    { timeout: 120_000 },
  );
} catch (error) {
  if (error !== rollback) throw error;
  // The outer rollback also restores pre-existing settings/manual plans.
  const after = await fingerprints();
  check(
    "rollback preserves row counts and contents in all ten ledger/plan/model/alert tables",
    () => assert.deepEqual(after, before),
  );
} finally {
  delete globalThis.__financialVerificationDb;
  await prisma.$disconnect();
}
console.log(
  `${passed} real-database checks passed; all verification writes rolled back.`,
);
