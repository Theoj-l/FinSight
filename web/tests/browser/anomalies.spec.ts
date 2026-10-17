import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

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
      const alert = ${JSON.stringify(alert)}; const finding = ${JSON.stringify(finding)};
      const status={scoredAt:'2026-09-01T00:00:00Z',scoredThrough:202608,dataThrough:202608,modelVersion:'v1',alertCount:4};
      const alerts=[alert,...['acc','cust','dept'].map((kind,i)=>({...alert,id:kind+':TEST'+i+':202608',kind,unitKey:'TEST'+i,unitLabel:'Finding '+i}))];
      const subscribe=cb=>{window.addEventListener('popstate',cb);return()=>window.removeEventListener('popstate',cb)};
      function App(){const search=useSyncExternalStore(subscribe,()=>window.location.search);const q=new URLSearchParams(search);const mode=q.get('profitMode')==='gross'?'gross':'net';
        const notifications=useHomeAlerts('browser-test', {period:'2026-08',priorPeriod:'2026-07',metrics:[{id:'revenue',label:'Revenue',value:100,prior:200,higherIsBetter:true,change:{percentage:-50,direction:-1,absolute:-100}}]}, alerts);
        return <main><h1>Financial dashboard</h1><AnomalyPanel alerts={alerts} status={status} periodEnd={202608}/>
        <ProfitMarginChart mode={mode} focus={q.has('anomaly')?{alert,finding}:null} data={[{period:'2025-08',periodNo:202508,grossProfit:300,grossMarginPct:30,netProfit:200,netMarginPct:20},{period:'2026-08',periodNo:202608,grossProfit:100,grossMarginPct:10,netProfit:50,netMarginPct:5}]}/>
        <NotificationPanel notifications={notifications} period='2026-08' priorPeriod='2026-07' dashboardHref='/dashboard?period=202608' evaluable={1} loadedAt='2026-09-01T00:00:00Z' anomalyAvailable/></main>};createRoot(document.getElementById('root')).render(<App/>);`, loader: "tsx", resolveDir: root },
    bundle: true, write: false, jsx: "automatic", platform: "browser", alias: { "@": root }, define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "controlled-navigation", setup(b) {
      b.onResolve({ filter: /^next\/(navigation|link)$/ }, args => ({ path: args.path, namespace: "fixture" }));
      b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ resolveDir: root, loader: "tsx", contents: args.path.endsWith("link") ? `import React from 'react';export default function Link({href,children,...props}){return <a {...props} href={href} onClick={e=>{e.preventDefault();history.pushState(null,'',href);window.dispatchEvent(new Event('popstate'));}}>{children}</a>}` : `import {useSyncExternalStore} from 'react';const nativePush=history.pushState.bind(history);history.pushState=(...args)=>{nativePush(...args);dispatchEvent(new Event('popstate'));};const subscribe=cb=>{addEventListener('popstate',cb);return()=>removeEventListener('popstate',cb)};export const useRouter=()=>({push:href=>{window.__routerNavigations=(window.__routerNavigations||0)+1;history.pushState(null,'',href);}});export const useSearchParams=()=>new URLSearchParams(useSyncExternalStore(subscribe,()=>location.search));` }));
    } }],
  });
  bundle = result.outputFiles[0].text;
  try { const directory = resolve(root, ".next/static/css"); css += readdirSync(directory).filter(f => f.endsWith(".css")).map(f => readFileSync(resolve(directory, f), "utf8")).join("\n"); } catch { /* Minimal styles suffice before a production build. */ }
});

test.beforeEach(async ({page}) => {
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/__bundle.js") return route.fulfill({ contentType: "text/javascript", body: bundle });
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
  await expect(notifications.getByText(/Threshold alert/)).toBeVisible();
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
