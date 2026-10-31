import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays, FileBarChart, FileText, PieChart, ShieldCheck } from "lucide-react";
import { PageHeading } from "@/app/components/app-page";
import { requireUser } from "@/lib/auth/require-user";

export const metadata: Metadata = {
  title: "Reports | FinSight",
  description: "Financial and management reports for TSH Group.",
};

const reportTypes = [
  { title: "Monthly performance", description: "Revenue, expenses, margin, and variance in one management-ready summary.", icon: FileBarChart, accent: "bg-brand-navy" },
  { title: "Profit & loss", description: "Detailed actual-versus-budget statement for the selected reporting period.", icon: FileText, accent: "bg-brand-red" },
  { title: "Cost breakdown", description: "Operating expenses grouped by category, unit, and reporting month.", icon: PieChart, accent: "bg-brand-blue" },
];

const recentReports = [
  { name: "Monthly performance · August 2026", type: "Management pack", date: "12 Sep 2026", status: "Ready" },
  { name: "Profit & loss · August 2026", type: "Financial statement", date: "10 Sep 2026", status: "Ready" },
  { name: "Cost review · Q3 2026", type: "Analysis", date: "08 Sep 2026", status: "Draft" },
];

export default async function ReportsPage() {
  await requireUser("/reports");

  return (
    <>
      <PageHeading
        eyebrow="Reporting library"
        title="Reports"
        description="Create clear, consistent reporting packs from the same trusted financial view."
        action={<Link href="/dashboard" className="inline-flex items-center gap-2 rounded-lg bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-navy-dark">Build from dashboard <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>}
      />

      <section aria-labelledby="report-types" className="mt-8">
        <h2 id="report-types" className="sr-only">Report types</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {reportTypes.map(({ title, description, icon: Icon, accent }) => (
            <article key={title} className="surface rounded-2xl p-5">
              <div className={`grid h-10 w-10 place-items-center rounded-xl text-white ${accent}`}><Icon aria-hidden="true" className="h-5 w-5" /></div>
              <h3 className="mt-5 font-semibold text-brand-navy">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
              <Link href="/dashboard" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-brand-navy transition hover:text-brand-red">View source data <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
            </article>
          ))}
        </div>
      </section>

      <section className="surface mt-6 overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div><h2 className="font-semibold text-brand-navy">Recent reports</h2><p className="mt-0.5 text-sm text-muted">Your latest prepared reporting packs.</p></div>
          <div className="flex items-center gap-2 text-xs text-muted"><CalendarDays aria-hidden="true" className="h-4 w-4" /> Updated 12 Sep 2026</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted"><tr><th className="px-6 py-3 font-medium">Report</th><th className="px-6 py-3 font-medium">Type</th><th className="px-6 py-3 font-medium">Created</th><th className="px-6 py-3 font-medium">Status</th><th className="px-6 py-3"><span className="sr-only">Action</span></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {recentReports.map((report) => (
                <tr key={report.name} className="transition hover:bg-slate-50/70">
                  <td className="px-6 py-4 font-medium text-slate-800">{report.name}</td>
                  <td className="px-6 py-4 text-muted">{report.type}</td>
                  <td className="px-6 py-4 text-muted">{report.date}</td>
                  <td className="px-6 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${report.status === "Ready" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{report.status}</span></td>
                  <td className="px-6 py-4 text-right"><Link href="/dashboard" className="font-semibold text-brand-navy hover:text-brand-red">Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2 border-t border-slate-100 bg-brand-blue-light/30 px-6 py-3 text-xs text-muted"><ShieldCheck aria-hidden="true" className="h-4 w-4 text-brand-blue" /> Reports use the same governed data shown in your dashboard.</div>
      </section>
    </>
  );
}
