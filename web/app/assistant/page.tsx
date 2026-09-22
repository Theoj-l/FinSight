import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, CalendarDays, MessageSquare, TrendingUp } from "lucide-react";
import { AppPage, PageHeading } from "@/app/components/app-page";
import { requireUser } from "@/lib/auth/require-user";

export const metadata: Metadata = {
  title: "Assistant | FinSight",
  description: "The conversational assistant workspace for FinSight.",
};

const examples = [
  { icon: BarChart3, title: "Understand performance", question: "How did revenue compare with the previous month?" },
  { icon: MessageSquare, title: "Explore changes", question: "What contributed to the change in net profit?" },
  { icon: TrendingUp, title: "Look ahead", question: "What is the revenue forecast for the next three months?" },
];

export default async function AssistantPage() {
  const user = await requireUser("/assistant");

  return (
    <AppPage email={user.email ?? "Finance user"}>
      <PageHeading
        eyebrow="Conversational workspace"
        title="Assistant"
        description="A place to ask questions about your company’s finances and explore the answers together."
        action={<span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">In development</span>}
      />

      <section aria-labelledby="assistant-status" className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <div className="max-w-2xl">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-blue-light text-brand-navy"><MessageSquare aria-hidden="true" className="h-6 w-6" /></span>
          <h2 id="assistant-status" className="mt-5 text-xl font-semibold tracking-tight text-brand-navy sm:text-2xl">Your financial conversation starts here.</h2>
          <p className="mt-3 text-sm leading-6 text-muted">The assistant is being prepared. Conversations and forecast answers are not available yet. You can explore financial metrics and review threshold alerts in the meantime.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-lg bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-navy-dark">Explore dashboard <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
            <Link href="/home#home-attention" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-brand-navy transition hover:bg-slate-50">Review attention alerts <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="assistant-examples" className="mt-8">
        <h2 id="assistant-examples" className="text-lg font-semibold text-brand-navy">Questions to explore</h2>
        <p className="mt-1 text-sm text-muted">Examples of the planned experience, available once the assistant is connected.</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {examples.map(({ icon: Icon, title, question }) => (
            <article key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <Icon aria-hidden="true" className="h-5 w-5 text-brand-blue" />
              <h3 className="mt-4 text-sm font-semibold text-brand-navy">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">“{question}”</p>
            </article>
          ))}
        </div>
      </section>

      <aside className="mt-6 flex items-start gap-3 rounded-xl border border-brand-blue/15 bg-brand-blue-light/60 p-5">
        <CalendarDays aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-brand-blue" />
        <div><h2 className="text-sm font-semibold text-brand-navy">Clear dates for every answer</h2><p className="mt-1 text-sm leading-6 text-muted">The planned assistant will distinguish reported results from forecasts, with the reporting or prediction period and the date the answer or forecast was generated.</p></div>
      </aside>
    </AppPage>
  );
}
