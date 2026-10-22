import { test, expect, type Locator } from "@playwright/test";
import { build } from "esbuild";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { financialFixture } from "../fixtures/financial";
import { comparisonKpis } from "../../lib/financial/presentation";

const financial = financialFixture();
// A realistic multi-month trend is required to exercise curves, not just one dot.
for (const series of Object.values(financial.sources)) {
  for (const period of [202603,202604,202605,202606,202607]) {
    const point = structuredClone(series[202608]); point.period = period;
    for (const comparison of Object.values(point.metrics)) {
      if (comparison.actual !== null) comparison.actual = String(Number(comparison.actual) * (period === 202605 ? 2 : 0.6 + (period % 100) / 20));
      if (comparison.reference !== null) comparison.reference = String(Number(comparison.reference) * (0.5 + (period % 100) / 20));
    }
    series[period] = point;
  }
}
financial.budgets.push({id:"2027",name:"Alternative plan"});
financial.budgetSources["2027"] = financial.sources.previous;
const homeData = comparisonKpis(financial, "previous");
homeData.financialComparisons = undefined;
homeData.metrics = homeData.metrics.filter(m => m.id === "revenue");
const metadata = { rules: financial.rules, notificationSource: "previous", latestPeriod: 202608, departments: [{dept_no:"HL",description:"Heavy Lift",segment:"Bulk"},{dept_no:"TR",description:"Transport",segment:"Bulk"}], accounts: [{acc_no:"4000",description:"Operating revenue",acc_type:"RE"},{acc_no:"5000",description:"Cost of sales",acc_type:"CS"}], budgets:financial.budgets, entries:{"4000":"120","5000":"20"},manual:{revenue:"150",netProfit:"85"},automatic:financial.sources.auto[202608] };

async function selectMenuOption(control: Locator, value: string) {
  await control.click();
  await control.page().getByRole("listbox").locator(`[role="option"][data-value="${value}"]`).click();
}

const root = resolve(__dirname, "../..");
let bundle: string;
let css = "body{font-family:Arial;margin:24px} main{max-width:1200px;margin:auto} section{margin-block:20px} summary{cursor:pointer} table{border-collapse:collapse} th,td{padding:8px}";
const alert = { id: "dept:HL:202608", kind: "dept", unitKey: "HL", unitLabel: "Heavy Lift", periodNo: 202608, score: .95, reasons: ["Gross margin below its typical level"], modelVersion: "v1", firstFlaggedAt: "2026-09-01T00:00:00Z" };
const finding = { code: "gross_margin_outlier", text: alert.reasons[0], recordLabel: "Related records", refs: Array.from({length: 21}, (_, i) => `ledger:${i+1}`), comparison: { actual: .1, baseline: .3, unit: "ratio", label: "Preceding 12-month median", periods: [202508,202608] }, chart: "gross", history: [{periodNo: 202508, value:.3}, {periodNo: 202608, value:.1}] };

test.beforeAll(async () => {
  const result = await build({
    stdin: { contents: `import React, {useSyncExternalStore} from 'react'; import {createRoot} from 'react-dom/client';
      import {AnomalyPanel} from '@/app/dashboard/components/anomaly-panel';
      import {ProfitMarginChart} from '@/app/dashboard/components/profit-margin-chart';
      import {NotificationPanel} from '@/app/home/notification-panel';
      import {useHomeAlerts} from '@/app/home/use-home-alerts';
      import {FinancialProvider,ComparisonSelector} from '@/app/components/financial/comparison-context';
      import {FinancialProfitLoss} from '@/app/components/financial/financial-pnl';
      import {KpiCards} from '@/app/dashboard/components/kpi-cards';
      import {RevenueExpenseChart} from '@/app/dashboard/components/revenue-expense-chart';
      import {SettingsPanel} from '@/app/settings/settings-panel';
      import {DashboardFilters} from '@/app/dashboard/components/dashboard-filters';
      import {parseDashboardFilters} from '@/app/dashboard/data/dashboard-scope';
      const chartBundle = ${JSON.stringify(financial)};
      const alert = ${JSON.stringify(alert)}; const finding = ${JSON.stringify(finding)};
      const status={scoredAt:'2026-09-01T00:00:00Z',scoredThrough:202608,dataThrough:202608,modelVersion:'v1',alertCount:4};
      const alerts=[alert,...['acc','cust','dept'].map((kind,i)=>({...alert,id:kind+':TEST'+i+':202608',kind,unitKey:'TEST'+i,unitLabel:'Finding '+i}))];
      const subscribe=cb=>{window.addEventListener('popstate',cb);return()=>window.removeEventListener('popstate',cb)};
      function App(){const search=useSyncExternalStore(subscribe,()=>window.location.search);const q=new URLSearchParams(search);const mode=q.get('profitMode')==='gross'?'gross':'net';
        const filterOptions={periods:[202608,202601,202512,202501],units:[{code:"HL",label:"Heavy Lift",businessType:"Bulk"},{code:"CP",label:"Corporate",businessType:"Bulk"},{code:"EN",label:"Engineering",businessType:"Machining"}],branches:[]};
        const selection=parseDashboardFilters({period:q.get("period")||undefined,periodStart:q.get("periodStart")||undefined,periodEnd:q.get("periodEnd")||undefined,businessType:q.get("businessType")||undefined,unit:q.getAll("unit")},filterOptions).selection;
        const notifications=useHomeAlerts('browser-test', ${JSON.stringify(homeData)}, alerts);
        if(location.pathname === "/filters") return <DashboardFilters key={JSON.stringify(selection)} destination="/filters" options={filterOptions} selection={selection}><p>Reporting data</p></DashboardFilters>;
        if(location.pathname === "/settings") return <main><SettingsPanel email="test@example.com" userId="browser-test"/></main>;
        const scopedBundle = q.has('stress') ? structuredClone(chartBundle) : chartBundle;
        if(q.has('stress')) {
          const metrics=scopedBundle.sources.previous[202608].metrics;
          metrics.revenue.actual='6029162.38'; metrics.revenue.reference='5622514.86';
          metrics.operatingExpenses.actual='849850.72'; metrics.operatingExpenses.reference=null;
          metrics.netProfit.actual='-912102.66'; metrics.netProfit.reference='-849295.20';
          metrics.netMargin.actual='-15.1276'; metrics.netMargin.reference=null;
          scopedBundle.sources.previous[202605].metrics.revenue.reference=null;
        }
        return <FinancialProvider bundle={scopedBundle}><main><h1>Financial dashboard</h1><ComparisonSelector/><KpiCards/><FinancialProfitLoss/><RevenueExpenseChart data={[{period:"2026-08",periodNo:202608,revenue:100,expenses:10}]}/><AnomalyPanel alerts={alerts} status={status} periodEnd={202608}/>
        <ProfitMarginChart mode={mode} focus={q.has('anomaly')?{alert,finding}:null} data={[{period:'2025-08',periodNo:202508,grossProfit:300,grossMarginPct:30,netProfit:200,netMarginPct:20},{period:'2026-08',periodNo:202608,grossProfit:100,grossMarginPct:10,netProfit:50,netMarginPct:5}]}/>
        <NotificationPanel notifications={notifications} period='2026-08' priorPeriod='2026-07' dashboardHref='/dashboard?period=202608' evaluable={1} loadedAt='2026-09-01T00:00:00Z' anomalyAvailable/></main></FinancialProvider>};createRoot(document.getElementById('root')).render(<App/>);`, loader: "tsx", resolveDir: root },
    bundle: true, write: false, jsx: "automatic", platform: "browser", alias: { "@": root }, define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "controlled-navigation", setup(b) {
      b.onResolve({ filter: /^next\/(navigation|link)$/ }, args => ({ path: args.path, namespace: "fixture" }));
      b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ resolveDir: root, loader: "tsx", contents: args.path.endsWith("link") ? `import React from 'react';export default function Link({href,children,...props}){return <a {...props} href={href} onClick={e=>{e.preventDefault();history.pushState(null,'',href);window.dispatchEvent(new Event('popstate'));}}>{children}</a>}` : `import {useSyncExternalStore} from 'react';const nativePush=history.pushState.bind(history);history.pushState=(...args)=>{nativePush(...args);dispatchEvent(new Event('popstate'));};const subscribe=cb=>{addEventListener('popstate',cb);return()=>removeEventListener('popstate',cb)};export const useRouter=()=>({push:href=>{window.__routerNavigations=(window.__routerNavigations||0)+1;history.pushState(null,'',href);}});export const useSearchParams=()=>new URLSearchParams(useSyncExternalStore(subscribe,()=>location.search));` }));
    } }],
  });
  bundle = result.outputFiles[0].text;
  const directory = resolve(root, ".next/static/css");
  const styles = readdirSync(directory).filter(f => f.endsWith(".css"));
  if (!styles.length) throw new Error("Build with npm run build -- --webpack before browser checks, and do not run them concurrently.");
  css += styles.map(f => readFileSync(resolve(directory, f), "utf8")).join("\n");
});

test.beforeEach(async ({page}) => {
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/__bundle.js") return route.fulfill({ contentType: "text/javascript", body: bundle });
    if (url.pathname === "/api/financial-settings") return route.fulfill({json:route.request().method() === "PUT" ? {message:"Company settings saved. Other views use these values on their next load."} : metadata});
    if (url.pathname.startsWith("/api/anomalies/")) {
      const id = decodeURIComponent(url.pathname.split("/").at(-1)!);
      const kind = id.split(":")[0];
      const f = kind === "dept" ? finding : {...finding, chart: null};
      const pageNo = Number(url.searchParams.get("page") ?? 1);
      const records = Array.from({length: pageNo === 1 ? 20 : 1}, (_, i) => ({id:String((pageNo-1)*20+i+1),source:"ledger",trans_date:"2026-08-30",ref_no1:`POST-${(pageNo-1)*20+i+1}`,acc_no:"6900",dept_no:kind === "acc" ? "CP" : "HL",description:"Related posting",home_dr:100,home_cr:0,gl_trx_id:String(i+1)}));
      return route.fulfill({ json: {alert,finding:f,findings:[f],records,total:21,page:pageNo,pages:2,missing:0,asOf:"2026-08-31"} });
    }
    return route.fulfill({contentType:"text/html",body:`<!doctype html><html><head><style>${css}</style></head><body><div id="root"></div><script src="/__bundle.js"></script></body></html>`});
  });
});

test("loads records on expansion, paginates, and opens gross comparison with scope", async ({page}) => {
  let requests = 0; page.on("request", r => {if(r.url().includes("/api/anomalies/")) requests++});
  await page.goto("/");
  expect(requests).toBe(0);
  const panel=page.getByRole("region",{name:/Anomalies to review/});
  const row=panel.locator("details").first();
  await row.locator("summary").focus(); await page.keyboard.press("Enter");
  await expect(row.getByRole("table")).toBeVisible();
  await expect(row.getByRole("button",{name:"Previous"})).toBeDisabled();
  // Hold the next response so we can observe pagination without a remount.
  let release!: () => void;
  const nextPage = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/anomalies/**", async route => {
    if (new URL(route.request().url()).searchParams.get("page") === "2") await nextPage;
    await route.fallback();
  });
  const explanation = await row.getByRole("link",{name:/View comparison/}).elementHandle();
  const table = await row.getByRole("table").elementHandle();
  const next = row.getByRole("button",{name:"Next",exact:true});
  await next.click();
  try {
    await expect(row.getByText("Loading page 2…", {exact:true})).toBeVisible();
    await expect(next).toBeDisabled();
    await expect(row.getByText("POST-1", {exact:true})).toBeVisible();
    expect(await explanation?.evaluate(node => node.isConnected)).toBe(true);
    expect(await table?.evaluate(node => node.isConnected)).toBe(true);
    await expect(row.getByText("Loading evidence…", {exact:true})).toHaveCount(0);
  } finally { release(); }
  await expect(row.getByText("Page 2 of 2")).toBeVisible();
  expect(await explanation?.evaluate(node => node.isConnected)).toBe(true);
  expect(await table?.evaluate(node => node.isConnected)).toBe(true);
  await expect(row.getByText("POST-21",{exact:true})).toBeVisible();
  await row.getByRole("link",{name:/View comparison/}).click();
  await expect(page).toHaveURL(/profitMode=gross/);
  await expect(page.getByRole("heading",{name:"Gross Profit and Margin"})).toBeFocused();
  expect(new URL(page.url()).searchParams.get("unit")).toBe("HL");
  await expect(page.getByText("10.00% vs 30.00% · Preceding 12-month median").last()).toBeVisible();
  await page.reload();
  await expect(page.getByRole("combobox",{name:"Profit and margin measure"})).toHaveValue("gross");
  await page.getByRole("combobox",{name:"Profit and margin measure"}).selectOption("net");
  await expect(page.getByRole("heading",{name:"Net Profit and Margin"})).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("combobox",{name:"Profit and margin measure"})).toHaveValue("gross");
  await page.goForward();
  await expect(page.getByRole("combobox",{name:"Profit and margin measure"})).toHaveValue("net");
});

test("has compact controls and no expense/customer graph actions on mobile", async ({page}) => {
  await page.setViewportSize({width:390,height:844}); await page.goto("/");
  const panel=page.getByRole("region",{name:/Anomalies to review/});
  await expect(panel.locator("details")).toHaveCount(3);
  await panel.getByRole("button",{name:"View all 4"}).click(); await expect(panel.locator("details")).toHaveCount(4);
  const expense=panel.locator("details").nth(1); await expense.locator("summary").click();
  await expect(expense.getByRole("table")).toBeVisible(); await expect(expense.getByRole("link")).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath("anomalies-mobile.png"),fullPage:true});
});

test("keeps mixed notification history and clears Home without removing dashboard findings", async ({page}) => {
  await page.goto("/");
  const notifications=page.getByRole("region",{name:/Notifications/});
  await expect(notifications.getByText(/Financial deviation/)).toBeVisible();
  await expect(notifications.getByText(/Anomaly detected/).first()).toBeVisible();
  await notifications.getByRole("button",{name:/Clear Heavy Lift anomaly notification/}).click();
  await expect(notifications.getByRole("button",{name:/Clear Heavy Lift anomaly notification/})).toHaveCount(0);
  const panel=page.getByRole("region",{name:/Anomalies to review/});
  await expect(panel.locator("summary").filter({hasText:"Heavy Lift"})).toBeVisible();
  await page.reload();
  await expect(notifications.getByRole("button",{name:/Clear Heavy Lift anomaly notification/})).toHaveCount(0);
});


test("switches only the graph without dashboard navigation or new requests", async ({page}) => {
  await page.goto("/dashboard?period=202608&unit=HL#profit-margin-title");
  const measure = page.getByRole("combobox", {name:"Profit and margin measure"});
  await expect(measure).toHaveValue("net");
  const panel = page.getByRole("region", {name:/Anomalies to review/});
  await panel.getByRole("button", {name:"View all 4"}).click();
  const documentHandle = await page.locator("h1").elementHandle();
  const requests: string[] = [];
  page.on("request", request => requests.push(request.url()));
  for (const mode of ["gross", "net", "gross"]) {
    await measure.selectOption(mode);
    await expect(page.getByRole("heading", {name:mode === "gross" ? "Gross Profit and Margin" : "Net Profit and Margin"})).toBeVisible();
    await expect(panel.locator("details")).toHaveCount(4);
    expect(new URL(page.url()).searchParams.get("period")).toBe("202608");
    expect(new URL(page.url()).searchParams.get("unit")).toBe("HL");
  }
  expect(await page.evaluate(() => (window as Window & {__routerNavigations?:number}).__routerNavigations ?? 0)).toBe(0);
  expect(requests).toEqual([]);
  expect(await documentHandle?.evaluate(node => node.isConnected)).toBe(true);
  await page.goBack();
  await expect(measure).toHaveValue("net");
  await page.goForward();
  await expect(measure).toHaveValue("gross");
});


test("keeps evidence visible and retries a failed table page in Home notifications", async ({page}) => {
  await page.goto("/");
  const notifications = page.getByRole("region", {name:/Notifications/});
  const row = notifications.locator("details").filter({has:page.locator("summary").filter({hasText:"Heavy Lift"})});
  await row.locator("summary").click();
  await expect(row.getByText("Page 1 of 2")).toBeVisible();
  const explanation = await row.getByRole("link", {name:/View comparison/}).elementHandle();
  let fail = true;
  await page.route("**/api/anomalies/**", async route => {
    if (new URL(route.request().url()).searchParams.get("page") === "2" && fail) {
      fail = false;
      return route.fulfill({status:503,json:{message:"Evidence could not be loaded. Try again."}});
    }
    return route.fallback();
  });
  await row.getByRole("button", {name:"Next",exact:true}).click();
  await expect(row.getByRole("alert")).toContainText("Showing the previously loaded page");
  await expect(row.getByText("POST-1", {exact:true})).toBeVisible();
  expect(await explanation?.evaluate(node => node.isConnected)).toBe(true);
  await row.getByRole("button", {name:"Retry",exact:true}).click();
  await expect(row.getByText("Page 2 of 2")).toBeVisible();
  await expect(row.getByRole("alert")).toHaveCount(0);
  await expect(row.getByText("POST-21", {exact:true})).toBeVisible();
  expect(await explanation?.evaluate(node => node.isConnected)).toBe(true);
});

test("shares all four sources across cards and P&L without requests, with URL history", async ({page}) => {
  await page.goto("/dashboard?period=202608&unit=HL");
  const selector = page.getByRole("combobox", {name:"Comparison source",exact:true});
  const revenueCard = page.getByRole("article").filter({has:page.getByRole("heading",{name:"Operating revenue",exact:true})});
  const pnl = page.getByRole("region", {name:"P&L comparison table"});
  const revenueRow = pnl.locator('tr[data-metric="revenue"]');
  const actual = await revenueRow.locator("td").first().textContent();
  const shell = await page.locator("h1").elementHandle();
  const requests: string[] = []; page.on("request", r => requests.push(r.url()));
  for (const [source, reference, header] of [["budget","120.00","Month Budget"],["auto","180.00","Auto Forecast"],["manual","150.00","Manual Forecast"],["previous","200.00","Previous Month Actual"]]) {
    await selectMenuOption(selector, source);
    if (source === "budget") await selectMenuOption(page.getByRole("combobox",{name:"Budget scenario",exact:true}), "2026");
    await expect(revenueCard).toContainText(`Reference: S$${reference}`);
    await expect(pnl.getByRole("columnheader",{name:header,exact:true})).toBeVisible();
    await expect(revenueRow.locator("td").nth(2)).toContainText(reference);
    expect(await revenueRow.locator("td").first().textContent()).toBe(actual);
    if (source === "auto" || source === "manual") {
      await expect(pnl.locator('tr[data-metric="grossProfit"]').locator("td").nth(2)).toHaveText("—");
      await expect(pnl.locator('tr[data-metric="operatingExpenses"]').locator("td").nth(2)).toHaveText("—");
    }
    // Home policy stays saved as previous-month, regardless of this selector.
    await expect(page.getByRole("region",{name:/Notifications/}).getByText(/−50.0% vs Default/)).toBeVisible();
    expect(new URL(page.url()).searchParams.get("unit")).toBe("HL");
  }
  expect(requests).toEqual([]);
  expect(await shell?.evaluate(n=>n.isConnected)).toBe(true);
  expect(await page.evaluate(()=>(window as Window & {__routerNavigations?:number}).__routerNavigations ?? 0)).toBe(0);
  await page.goBack(); await expect(selector).toHaveAttribute("data-value", "manual");
  await page.goForward(); await expect(selector).toHaveAttribute("data-value", "previous");
  await page.reload(); await expect(selector).toHaveAttribute("data-value", "previous");
});

test("retains the chosen budget on refresh and exposes invalid URL values", async ({page}) => {
  await page.goto("/dashboard?period=202608&unit=HL&comparison=budget&budgetId=2027");
  const pnl=page.getByRole("region",{name:"P&L comparison table"});
  await expect(pnl.locator('tr[data-metric="revenue"]').locator("td").nth(2)).toContainText("200.00");
  await page.reload();
  await expect(page.getByRole("combobox",{name:"Budget scenario",exact:true})).toHaveAttribute("data-value", "2027");
  await page.goto("/dashboard?comparison=unknown");
  await expect(page.getByRole("alert").first()).toContainText("comparison source is invalid");
  await page.goto("/dashboard?comparison=budget&budgetId=deleted");
  await expect(page.getByRole("alert").first()).toContainText("budget scenario is unavailable");
});

test("edits centralized rules and plans, keeps drafts on failure, and persists notification policy", async ({page}) => {
  const writes: Record<string,unknown>[]=[];
  let failManual = false;
  await page.route("**/api/financial-settings*", async route => {
    if (route.request().method() !== "PUT") return route.fallback();
    const body=route.request().postDataJSON(); writes.push(body);
    if (body.kind === "manual" && failManual) { failManual=false; return route.fulfill({status:503,json:{message:"Changes could not be saved. Try again."}}); }
    return route.fallback();
  });
  await page.goto("/settings#thresholds");
  await page.getByRole("link",{name:"Threshold Settings",exact:true}).click();
  const tolerance=page.getByRole("spinbutton",{name:"Operating revenue tolerance (%)",exact:true});
  await expect(tolerance).toHaveValue("10");
  await tolerance.fill("15"); await page.getByRole("button",{name:"Save thresholds",exact:true}).click();
  await expect.poll(()=>writes.length).toBe(1);
  expect((writes[0].rules as typeof financial.rules).revenue.tolerance).toBe(15);
  await page.getByRole("button",{name:"Reset draft to 0%"}).click();
  await expect(tolerance).toHaveValue("0"); expect(writes).toHaveLength(1);
  await page.getByRole("link",{name:"Budgets & Forecasts",exact:true}).click();
  const planning=page.locator("#budgets-forecasts");
  await planning.getByRole("combobox",{name:"Home notification comparison source"}).selectOption("budget");
  await planning.getByRole("combobox",{name:"Home budget scenario"}).selectOption("2026");
  await planning.getByRole("button",{name:"Save notification source"}).click();
  await expect.poll(()=>writes.length).toBe(2); expect(writes[1]).toEqual({kind:"source",source:"budget",budgetId:"2026"});
  await expect(planning.getByText(/calculated summary/)).toBeVisible();
  await expect(planning.getByRole("button",{name:"Save manual forecast"})).toHaveCount(0);
  await planning.getByRole("combobox",{name:"Business type",exact:true}).selectOption("Bulk");
  await planning.getByRole("combobox",{name:"Business unit",exact:true}).selectOption("HL");
  const manual=planning.getByRole("spinbutton",{name:"Operating revenue (SGD)",exact:true});
  await expect(manual).toHaveValue("150");
  await manual.fill("0");
  await planning.getByRole("spinbutton",{name:"Net profit (SGD)",exact:true}).fill("-25");
  await planning.getByRole("button",{name:"Save manual forecast"}).click();
  await expect.poll(()=>writes.length).toBe(3);
  expect(writes[2]).toMatchObject({kind:"manual",department:"HL",period:202608,revenue:"0",netProfit:"-25"});
  failManual=true; await planning.getByRole("button",{name:"Clear manual forecast"}).click();
  await expect(planning.getByText("Changes could not be saved. Try again.",{exact:true})).toBeVisible();
  await expect(manual).toHaveValue("0"); // failed clear retains the edit
  await planning.getByRole("button",{name:"Clear manual forecast"}).click();
  await expect(manual).toHaveValue("");
  await planning.getByRole("combobox",{name:"Budget scenario",exact:true}).selectOption("2026");
  await planning.getByRole("spinbutton",{name:"Budget 4000",exact:true}).fill("200.25");
  await planning.getByRole("spinbutton",{name:"Budget 5000",exact:true}).fill("");
  await planning.getByRole("button",{name:"Save budget"}).click();
  await expect.poll(()=>writes.some(w=>w.kind==="budget")).toBe(true);
  expect(writes.at(-1)).toMatchObject({kind:"budget",department:"HL",period:202608,budgetId:"2026",entries:[{account:"4000",amount:"200.25"},{account:"5000",amount:null}]});
  await page.screenshot({path:test.info().outputPath("financial-settings-desktop.png"),fullPage:true});
});

test("retries failed settings loading and fits comparison/settings controls on mobile", async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  let first=true;
  await page.route("**/api/financial-settings*",async route=>{
    if(first){first=false; return route.fulfill({status:503,json:{message:"Company settings could not be loaded. Try again."}});}
    return route.fallback();
  });
  await page.goto("/settings#thresholds");
  await expect(page.getByRole("alert")).toContainText("could not be loaded");
  await page.getByRole("button",{name:"Retry",exact:true}).click();
  await expect(page.getByRole("button",{name:"Save thresholds",exact:true})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Threshold Settings",exact:true})).toBeFocused();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath("financial-settings-mobile.png"),fullPage:true});
  await page.goto("/dashboard?comparison=auto");
  await expect(page.getByRole("combobox",{name:"Comparison source",exact:true})).toHaveAttribute("data-value", "auto");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test("business type prunes incompatible units, persists on refresh and supports history", async ({page}) => {
  await page.goto("/filters?unit=HL");
  await selectMenuOption(page.getByRole("combobox",{name:"Business type",exact:true}), "Machining");
  await page.getByRole("button",{name:"All business units",exact:true}).click();
  await expect(page.getByText("Engineering",{exact:true})).toBeVisible();
  await expect(page.getByText("Heavy Lift",{exact:true})).toHaveCount(0);
  await page.getByRole("checkbox").check();
  await page.getByRole("button",{name:"Apply Filters"}).click();
  await expect(page).toHaveURL(/businessType=Machining&unit=EN/);
  await page.reload();
  await expect(page.getByRole("combobox",{name:"Business type",exact:true})).toHaveAttribute("data-value", "Machining");
  await page.goBack();
  await expect(page.getByRole("combobox",{name:"Business type",exact:true})).toHaveAttribute("data-value", "");
  await page.goForward();
  await expect(page.getByRole("combobox",{name:"Business type",exact:true})).toHaveAttribute("data-value", "Machining");
});

for (const width of [1280,390]) test(`comparison styles remain visible at ${width}px with local Net/Gross switching`, async ({page}) => {
  await page.setViewportSize({width,height:900});
  await page.goto("/dashboard");
  const profit = page.getByRole("region",{name:"Net Profit and Margin",exact:true});
  // Both the plotted curves and legend use the contrasting colours and dash patterns.
  await expect(profit.locator('.recharts-curve[stroke="#6B83B5"][stroke-width="3"]').first()).toBeAttached();
  await expect(profit.locator('.recharts-curve[stroke="#B46A60"][stroke-width="3"]').first()).toBeAttached();
  await expect(profit.locator('.recharts-curve[stroke="white"]')).toHaveCount(0);
  const revenue=page.getByRole("region",{name:"Revenue vs Operating Expenses",exact:true});
  await expect(revenue.locator('.recharts-curve[stroke="#6B83B5"][stroke-dasharray="10 5"]').first()).toBeAttached();
  await page.getByRole("combobox",{name:"Profit and margin measure"}).selectOption("gross");
  await expect(page.getByRole("heading",{name:"Gross Profit and Margin"})).toBeVisible();
  // Recharts animates the actual bars for 1.5 seconds after changing measure.
  await page.waitForTimeout(1600);
  await page.getByRole("region",{name:"Gross Profit and Margin",exact:true}).screenshot({path:test.info().outputPath(`comparisons-${width}.png`)});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1)).toBe(true);
});

for (const width of [1280, 390, 320]) test(`compact hover values stay inside both charts at ${width}px`, async ({page}) => {
  await page.setViewportSize({width,height:1000});
  await page.goto("/dashboard");
  const requests: string[]=[];
  page.on("request",r=>requests.push(r.url()));
  for (const title of ["Revenue vs Operating Expenses", "Net Profit and Margin"]) {
    const chart=page.getByRole("region",{name:title,exact:true});
    const markers=chart.locator('.recharts-line-dots circle[stroke="#6B83B5"]');
    for (const index of [0,2,5]) {
      await markers.nth(index).hover();
      const tooltip=chart.getByRole("tooltip");
      await expect(tooltip).toBeVisible();
      await expect(tooltip.getByRole("table")).toBeVisible();
      await expect(tooltip.getByText("Default — Previous month",{exact:true})).toHaveCount(1);
      await expect(tooltip.getByRole("columnheader",{name:"Actual",exact:true})).toBeVisible();
      await expect(tooltip.getByRole("columnheader",{name:"Comparison",exact:true})).toBeVisible();
      const bounds=await chart.locator('.recharts-wrapper').boundingBox();
      const box=await tooltip.boundingBox();
      expect(box!.width).toBeLessThanOrEqual(bounds!.width-15);
      expect(box!.x).toBeGreaterThanOrEqual(bounds!.x);
      expect(box!.x+box!.width).toBeLessThanOrEqual(bounds!.x+bounds!.width+1);
      expect(box!.y).toBeGreaterThanOrEqual(bounds!.y);
      expect(box!.y+box!.height).toBeLessThanOrEqual(bounds!.y+bounds!.height+1);
      const marker=await markers.nth(index).boundingBox();
      if (width===1280 && index===0) expect(box!.x).toBeGreaterThan(marker!.x+marker!.width);
      if (width===1280 && index===5) expect(box!.x+box!.width).toBeLessThan(marker!.x);
    }
    await chart.screenshot({path:test.info().outputPath(`hover-${title.startsWith("Net")?"profit":"revenue"}-${width}.png`)});
    await page.mouse.move(0,0);
    await expect(chart.getByRole("tooltip")).toHaveCount(0);
  }
  expect(requests).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test("hover values follow sources, Gross mode and unavailable metrics without requests", async ({page}) => {
  await page.goto('/dashboard');
  const requests: string[]=[]; page.on("request",r=>requests.push(r.url()));
  const source=page.getByRole("combobox",{name:"Comparison source"});
  const revenue=page.getByRole("region",{name:"Revenue vs Operating Expenses",exact:true});
  for (const [id,label] of [["previous","Default — Previous month"],["budget","Budget"],["auto","Auto forecast"],["manual","Manual forecast"]]) {
    await selectMenuOption(source, id);
    await revenue.locator('.recharts-line-dots circle[stroke="#6B83B5"]').last().hover();
    const card=revenue.getByRole("tooltip");
    await expect(card.getByText(label,{exact:true})).toHaveCount(1);
    if (id==='auto'||id==='manual') await expect(card.getByRole('row',{name:/Expenses/})).toContainText('Unavailable');
  }
  await selectMenuOption(source, 'previous');
  await page.getByRole('combobox',{name:'Profit and margin measure'}).selectOption('gross');
  const profit=page.getByRole('region',{name:'Gross Profit and Margin',exact:true});
  await profit.locator('.recharts-line-dots circle[stroke="#6B83B5"]').last().hover();
  const card=profit.getByRole('tooltip');
  await expect(card.getByRole('row',{name:/Gross profit/})).toContainText('$80.00');
  await expect(card.getByRole('row',{name:/Gross margin/})).toContainText('80.00%');
  expect(requests).toEqual([]);
});

test("keyboard arrows inspect months and Escape dismisses the compact card", async ({page}) => {
  await page.goto('/dashboard');
  const chart=page.getByRole('region',{name:'Revenue vs Operating Expenses',exact:true});
  await chart.locator('svg[role="application"]').focus();
  await page.keyboard.press('ArrowRight');
  const tooltip=chart.getByRole('tooltip');
  await expect(tooltip).toBeVisible();
  const first=await tooltip.getByRole('paragraph').first().textContent();
  await page.keyboard.press('ArrowRight');
  await expect(tooltip.getByRole('paragraph').first()).not.toHaveText(first!);
  await page.keyboard.press('Escape');
  await expect(tooltip).toBeHidden();
});

test("tapping a month on a touch screen shows compact values", async ({browser}) => {
  const context=await browser.newContext({viewport:{width:390,height:900},hasTouch:true});
  const page=await context.newPage();
  // Reuse the controlled production-component document and API routes.
  await page.route('**/*',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/__bundle.js') return route.fulfill({contentType:'text/javascript',body:bundle});
    return route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><style>${css}</style></head><body><div id="root"></div><script src="/__bundle.js"></script></body></html>`});
  });
  await page.goto('http://localhost:4174/dashboard');
  const chart=page.getByRole('region',{name:'Revenue vs Operating Expenses',exact:true});
  await chart.locator('.recharts-line-dots circle[stroke="#6B83B5"]').last().tap();
  await expect(chart.getByRole('tooltip')).toBeVisible();
  await expect(chart.getByRole('tooltip')).toContainText('2026-08');
  await context.close();
});


test("hover cards preserve large amounts, negatives and missing values on narrow screens", async ({page}) => {
  await page.setViewportSize({width:320,height:1000});
  await page.goto('/dashboard?stress=1');
  for (const [title, expected] of [['Revenue vs Operating Expenses','$6,029,162.38'],['Net Profit and Margin','-$912,102.66']]) {
    const chart=page.getByRole('region',{name:title,exact:true});
    await chart.locator('.recharts-line-dots circle[stroke="#6B83B5"]').last().hover();
    const card=chart.getByRole('tooltip');
    await expect(card).toContainText(expected);
    await expect(card).toContainText('Unavailable');
    for (const amount of await card.locator('[data-hover-value]').all()) {
      expect(await amount.evaluate(e => { const range=document.createRange(); range.selectNodeContents(e); return range.getClientRects().length; })).toBe(1);
    }
    expect(await card.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  }
  const reference=page.getByRole('region',{name:'Revenue vs Operating Expenses',exact:true}).locator('.recharts-line .recharts-curve[stroke="#6B83B5"]');
  // Stock Recharts curves must keep two segments across the missing month.
  await expect(reference).toHaveAttribute('d',/M.*M/);
});

test("anomaly hover values retain their separate model definition", async ({page}) => {
  await page.goto('/dashboard?profitMode=gross&anomaly=dept:HL:202608&reason=gross_margin_outlier');
  const chart=page.getByRole('region',{name:'Gross Profit and Margin',exact:true});
  await chart.locator('.recharts-line-dots circle[stroke="#6B83B5"]').last().hover();
  const card=chart.getByRole('tooltip');
  await expect(card).toContainText('Model gross margin (includes other income): 10.00%');
  await expect(card.getByRole('row',{name:/Gross margin/})).toContainText('80.00%');
});

for (const viewport of [1280,390]) test(`filter controls align and month popups stay compact at ${viewport}px`, async ({page}) => {
  await page.setViewportSize({width:viewport,height:1000});
  await page.goto('/filters');
  const month=page.getByRole('button',{name:/^Month Aug 2026/});
  const controls=[month,page.getByRole('combobox',{name:'Business type',exact:true}),page.getByRole('button',{name:'All business units',exact:true}),page.getByRole('button',{name:'All branches',exact:true})];
  const boxes=[];
  for(const control of controls) {const box=await control.boundingBox(); expect(box!.height).toBe(44); boxes.push(box!);}
  if(viewport===1280) expect(Math.max(...boxes.map(b=>b.y))-Math.min(...boxes.map(b=>b.y))).toBeLessThanOrEqual(1);
  await month.click();
  const picker=page.getByRole('dialog',{name:'Choose month',exact:true});
  await expect(picker.getByRole('button',{name:'August 2026',exact:true})).toBeFocused();
  await expect(picker.getByRole('button',{name:'February 2026',exact:true})).toBeDisabled();
  expect(await picker.evaluate(e=>e.scrollHeight<=e.clientHeight)).toBe(true);
  const popup=await picker.boundingBox(); expect(popup!.x+popup!.width).toBeLessThanOrEqual(viewport);
  await picker.screenshot({path:test.info().outputPath(`month-picker-${viewport}.png`)});
  await page.keyboard.press('ArrowLeft');
  await expect(picker.getByRole('button',{name:'January 2026',exact:true})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(month).toBeFocused();
  await month.click();
  await picker.getByRole('button',{name:'Previous year',exact:true}).click();
  await picker.getByRole('button',{name:'December 2025',exact:true}).click();
  await expect(page.getByRole('button',{name:/^Month Dec 2025/})).toBeFocused();
  await page.getByRole('button',{name:'Apply Filters',exact:true}).click();
  await expect(page).toHaveURL(/periodStart=202512&periodEnd=202512/);
  await page.getByRole('button',{name:'Date range',exact:true}).click();
  await expect(page.getByRole('button',{name:/^Range start Dec 2025/})).toBeVisible();
  await page.getByRole('button',{name:/^Range end Dec 2025/}).click();
  const end=page.getByRole('dialog',{name:'Choose range end',exact:true});
  await end.getByRole('combobox',{name:'Reporting year',exact:true}).selectOption('2026');
  await end.getByRole('button',{name:'January 2026',exact:true}).click();
  await page.getByRole('button',{name:'Apply Filters',exact:true}).click();
  await expect(page).toHaveURL(/periodStart=202512&periodEnd=202601/);
  await page.reload();
  await expect(page.getByRole('button',{name:/^Range end Jan 2026/})).toBeVisible();
  await page.getByRole('button',{name:/^Range start Dec 2025/}).click();
  await page.getByRole('heading',{name:'Reporting scope',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.getByRole('region',{name:'Dashboard filters',exact:true}).screenshot({path:test.info().outputPath(`filters-${viewport}.png`)});
});

test('comparison and budget selectors use the same control height',async ({page})=>{
  await page.goto('/dashboard');
  const source=page.getByRole('combobox',{name:'Comparison source',exact:true});
  expect((await source.boundingBox())!.height).toBe(44);
  await selectMenuOption(source, 'budget');
  expect((await page.getByRole('combobox',{name:'Budget scenario',exact:true}).boundingBox())!.height).toBe(44);
});

test('large hover values grow the card on desktop and remain on one line',async ({page})=>{
  await page.goto('/dashboard?stress=1');
  const chart=page.getByRole('region',{name:'Revenue vs Operating Expenses',exact:true});
  await chart.locator('.recharts-line-dots circle[stroke="#6B83B5"]').last().hover();
  const card=chart.getByRole('tooltip');
  await expect(card).toBeVisible();
  expect((await card.boundingBox())!.width).toBeGreaterThan(240);
  for(const amount of await card.locator('[data-hover-value]').all()) {
    expect(await amount.evaluate(e=>{const r=document.createRange();r.selectNodeContents(e);return r.getClientRects().length;})).toBe(1);
  }
  await chart.screenshot({path:test.info().outputPath('hover-dynamic-width.png')});
});

for(const width of [1280,390]) test(`app-styled dropdowns match the white branch menus at ${width}px`,async ({page})=>{
  await page.setViewportSize({width,height:1000});
  await page.goto('/filters');
  const type=page.getByRole('combobox',{name:'Business type',exact:true});
  expect(await type.evaluate(e=>e.tagName)).toBe('BUTTON');
  await type.click();
  let menu=page.getByRole('listbox',{name:'Business type',exact:true});
  await expect(menu).toHaveCSS('background-color','rgb(255, 255, 255)');
  await expect(menu.getByRole('option',{name:'All business types',exact:true})).toHaveAttribute('aria-selected','true');
  expect((await menu.boundingBox())!.width).toBeCloseTo((await type.boundingBox())!.width,0);
  await menu.screenshot({path:test.info().outputPath(`business-type-menu-${width}.png`)});
  await menu.getByRole('option',{name:'Bulk',exact:true}).click();
  await expect(type).toContainText('Bulk');
  await expect(type).toBeFocused();
  await expect(menu).toHaveCount(0);
  await page.goto('/dashboard');
  const source=page.getByRole('combobox',{name:'Comparison source',exact:true});
  await source.click();
  menu=page.getByRole('listbox',{name:'Comparison source',exact:true});
  await expect(menu).toHaveCSS('background-color','rgb(255, 255, 255)');
  await menu.screenshot({path:test.info().outputPath(`comparison-menu-${width}.png`)});
  await menu.getByRole('option',{name:'Budget',exact:true}).click();
  await expect(source).toContainText('Budget');
  const budget=page.getByRole('combobox',{name:'Budget scenario',exact:true});
  await budget.click();
  await expect(page.getByRole('listbox',{name:'Budget scenario',exact:true})).toHaveCSS('background-color','rgb(255, 255, 255)');
  await page.getByRole('heading',{name:'Financial dashboard',exact:true}).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('custom dropdown keyboard navigation, typing and dismissal preserve selection',async ({page})=>{
  await page.goto('/filters');
  const type=page.getByRole('combobox',{name:'Business type',exact:true});
  await type.focus();
  await page.keyboard.press('ArrowDown');
  await expect(type).toHaveAttribute('aria-expanded','true');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(type).toHaveAttribute('data-value','Bulk');
  await type.click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Escape');
  await expect(type).toHaveAttribute('data-value','Bulk');
  await expect(type).toBeFocused();
  await page.keyboard.type('mach');
  await page.keyboard.press('Enter');
  await expect(type).toHaveAttribute('data-value','Machining');
  await type.click();
  await page.keyboard.press('Tab');
  await expect(type).toHaveAttribute('aria-expanded','false');
});
