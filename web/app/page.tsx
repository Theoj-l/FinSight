import { FeatureCarousel } from "@/app/components/feature-carousel";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/home");

  return (
    <div className="flex flex-1 flex-col">
      {/* Nav */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Image src="/tsh.png" alt="TSH Group" width={128} height={34} priority />
        <nav className="flex items-center gap-3 text-sm font-medium">
          <Link href="/login" className="rounded-lg bg-brand-red px-4 py-2 text-white transition-colors hover:bg-brand-red-dark focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue">
            Sign in
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col">
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-brand-blue-light blur-3xl"
          />
          <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 pb-20 pt-16 sm:pt-24">
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
            <div className="mt-2">
              <Link href="/login" className="inline-flex rounded-lg bg-brand-red px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-red-dark focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue">
                Sign in
              </Link>
            </div>
          </div>
        </section>

        <FeatureCarousel />
      </main>

      <footer className="mx-auto w-full max-w-6xl px-6 py-8 text-sm text-muted">
        <span className="font-medium text-brand-navy">FinSight</span> · Final-year
        project for TSH Group
      </footer>
    </div>
  );
}
