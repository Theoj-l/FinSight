import styles from "./landing.module.css";
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
    <div className={styles.page}>
      {/* Nav */}
      <header className={`${styles.container} ${styles.header}`}>
        <div className={styles.brand}>
          <Image src="/FinSight_logo.png" alt="FinSight" width={120} height={40} priority />
          <span aria-hidden="true" />
          <Image src="/tsh.png" alt="TSH Group" width={112} height={30} priority />
        </div>
        <nav className="flex items-center gap-3 text-sm font-medium">
          <Link href="/login" className={styles.navSignIn}>
            Sign In
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <main className={styles.main}>
        <section className={styles.hero}>
          <div
            aria-hidden
            className="pointer-events-none absolute -right-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-brand-blue-light blur-3xl"
          />
          <div className={`${styles.container} ${styles.heroContent}`}>
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-brand-blue-light px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-navy">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-red" />
              Financial intelligence
            </span>
            <h1 className={styles.title}>
              Financial insight for{" "}
              <span className="text-brand-red">TSH Group</span>, in one clear view.
            </h1>
            <p className={styles.description}>
              FinSight turns financial and operational data into forward-looking
              insight — so the numbers tell you what is coming, not just what
              already happened.
            </p>
            <div className="mt-2">
              <Link href="/login" className={styles.signIn}>
                Sign in
              </Link>
            </div>
          </div>
        </section>

        <FeatureCarousel />
      </main>

      <footer className={`${styles.container} ${styles.footer}`}>
        <span className="font-medium text-brand-navy">FinSight</span> · Financial intelligence for TSH Group
      </footer>
    </div>
  );
}
