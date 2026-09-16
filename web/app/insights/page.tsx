import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeDollarSign,
  CircleAlert,
  Lightbulb,
  TrendingUp,
} from "lucide-react";
import { AppPage, PageHeading } from "@/app/components/app-page";
import { requireUser } from "@/lib/auth/require-user";

export const metadata: Metadata = {
  title: "Insights | FinSight",
  description: "Prioritised financial insights for TSH Group.",
};

const insights = [
  {
    title: "Revenue momentum is strengthening",
    summary: "Transport and engineering activity is pacing ahead of the recent monthly average.",
    metric: "+8.4%",
    metricLabel: "vs prior period",
    confidence: "High confidence",
    icon: TrendingUp,
    tone: "emerald",
  },
  {
    title: "Operating costs need attention",
    summary: "Fuel and subcontractor costs are growing faster than revenue in two business units.",
    metric: "+5.7%",
    metricLabel: "cost pressure",
    confidence: "High confidence",
    icon: CircleAlert,
    tone: "amber",
  },
  {
    title: "Margin recovery opportunity",
    summary: "A small set of active projects is carrying below-target gross margin and warrants review.",
    metric: "3",
    metricLabel: "projects to review",
    confidence: "Medium confidence",
    icon: BadgeDollarSign,
    tone: "blue",
  },
] as const;

const toneStyles = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  blue: "border-blue-200 bg-blue-50 text-brand-blue",
};

export default async function InsightsPage() {
  const user = await requireUser("/insights");

  return (
    <AppPage email={user.email ?? "Finance user"}>
      <PageHeading
        eyebrow="Decision support"
        title="Insights"
        description="The signals that matter most, ranked so your team can move from numbers to action quickly."
        action={
          <span className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Updated with latest data
          </span>
        }
      />

      <section aria-labelledby="priority-insights" className="mt-8">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 id="priority-insights" className="text-lg font-semibold text-brand-navy">Priority insights</h2>
            <p className="mt-1 text-sm text-muted">Ranked by expected impact and model confidence.</p>
          </div>
          <span className="rounded-full bg-brand-blue-light px-3 py-1 text-xs font-semibold text-brand-navy">3 active</span>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {insights.map(({ title, summary, metric, metricLabel, confidence, icon: Icon, tone }) => (
            <article key={title} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_30px_-24px_rgba(31,42,121,0.5)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_38px_-25px_rgba(31,42,121,0.45)]">
              <div className="flex items-start justify-between gap-4">
                <span className={`grid h-10 w-10 place-items-center rounded-xl border ${toneStyles[tone]}`}>
                  <Icon aria-hidden="true" className="h-5 w-5" />
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">{confidence}</span>
              </div>
              <h3 className="mt-5 text-base font-semibold text-brand-navy">{title}</h3>
              <p className="mt-2 min-h-12 text-sm leading-6 text-muted">{summary}</p>
              <div className="mt-5 flex items-end justify-between border-t border-slate-100 pt-4">
                <div>
                  <p className="text-2xl font-semibold tracking-tight text-brand-navy">{metric}</p>
                  <p className="text-xs text-muted">{metricLabel}</p>
                </div>
                <ArrowRight aria-hidden="true" className="h-5 w-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-brand-red" />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-navy text-white"><Lightbulb aria-hidden="true" className="h-4 w-4" /></span>
            <div>
              <h2 className="font-semibold text-brand-navy">Recommended next actions</h2>
              <p className="text-sm text-muted">A focused review plan for this reporting cycle.</p>
            </div>
          </div>
          <ol className="mt-5 space-y-1">
            {[
              ["Review cost variance", "Compare fuel and subcontractor spend against monthly budgets."],
              ["Inspect project margins", "Prioritise the three projects tracking below margin target."],
              ["Share the monthly brief", "Send the latest performance report to business unit leads."],
            ].map(([title, copy], index) => (
              <li key={title} className="flex gap-4 rounded-xl px-3 py-3 transition hover:bg-slate-50">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-blue-light text-xs font-bold text-brand-navy">{index + 1}</span>
                <div><p className="text-sm font-semibold text-slate-800">{title}</p><p className="mt-0.5 text-sm text-muted">{copy}</p></div>
              </li>
            ))}
          </ol>
        </div>

        <aside className="overflow-hidden rounded-2xl bg-brand-navy p-6 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-200">Explore the numbers</p>
          <h2 className="mt-3 text-xl font-semibold">See the evidence behind every signal.</h2>
          <p className="mt-2 text-sm leading-6 text-blue-100/80">Use dashboard filters to compare periods, business units, and branches.</p>
          <Link href="/dashboard" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-brand-navy transition hover:bg-brand-blue-light">
            Open dashboard <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </aside>
      </section>
    </AppPage>
  );
}
