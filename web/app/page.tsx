import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const features = [
  {
    title: "Unified financials",
    body: "Bring ledgers, projects and operations into one place — no more stitching spreadsheets together.",
  },
  {
    title: "Forward-looking insight",
    body: "Machine-learning models surface cash-flow risks and trends before they show up in the monthly report.",
  },
  {
    title: "Built for TSH Group",
    body: "Designed around how the group actually works, from heavy-lift projects to group-level reporting.",
  },
];

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex flex-1 flex-col">
      {/* Nav */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Image src="/tsh.png" alt="TSH Group" width={128} height={34} priority />
        <nav className="flex items-center gap-3 text-sm font-medium">
          {user ? (
            <Link
              href="/dashboard"
              className="rounded-lg bg-brand-navy px-4 py-2 text-white transition-colors hover:bg-brand-navy-dark"
            >
              Go to dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg px-3 py-2 text-brand-navy transition-colors hover:bg-black/[.04]"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-brand-red px-4 py-2 text-white transition-colors hover:bg-brand-red-dark"
              >
                Get started
              </Link>
            </>
          )}
        </nav>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col">
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-brand-blue-light blur-3xl"
          />
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 pb-20 pt-16 sm:pt-24">
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-brand-blue-light px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-navy">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-red" />
              FinSight · FYP
            </span>
            <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight text-brand-navy sm:text-5xl">
              Financial insight for{" "}
              <span className="text-brand-red">TSH Group</span>, in one clear view.
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-muted">
              FinSight turns financial and operational data into forward-looking
              insight — so the numbers tell you what is coming, not just what
              already happened.
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              <Link
                href={user ? "/dashboard" : "/signup"}
                className="rounded-lg bg-brand-red px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-red-dark"
              >
                {user ? "Open dashboard" : "Get started"}
              </Link>
              <Link
                href="/login"
                className="rounded-lg border border-brand-navy/20 px-5 py-3 text-sm font-semibold text-brand-navy transition-colors hover:bg-brand-navy/[.04]"
              >
                Sign in
              </Link>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-black/5 bg-brand-blue-light/40">
          <div className="mx-auto grid w-full max-w-6xl gap-6 px-6 py-16 sm:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-black/5 bg-white p-6 shadow-sm"
              >
                <div className="mb-3 h-1 w-8 rounded-full bg-brand-red" />
                <h3 className="text-base font-semibold text-brand-navy">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-6 py-8 text-sm text-muted">
        <span className="font-medium text-brand-navy">FinSight</span> · Final-year
        project for TSH Group
      </footer>
    </div>
  );
}
