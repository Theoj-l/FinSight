import styles from "@/app/auth/auth.module.css";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className={styles.page}>
      {/* Decorative financial chart, not a representation of company data. */}
      <svg aria-hidden="true" viewBox="0 0 1440 960" preserveAspectRatio="xMidYMid slice" fill="none" className={styles.graph}>
        <defs>
          <pattern id="auth-grid" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M80 0H0V80" stroke="#1f2a79" strokeOpacity=".045" /></pattern>
          <linearGradient id="auth-area" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#4c6fbb" stopOpacity=".12" /><stop offset="1" stopColor="#4c6fbb" stopOpacity="0" /></linearGradient>
        </defs>
        <rect width="1440" height="960" fill="url(#auth-grid)" />
        <path d="M-40 780L130 695L280 730L440 570L610 610L790 435L960 475L1120 305L1280 345L1480 135V960H-40Z" fill="url(#auth-area)" />
        <path d="M-40 780L130 695L280 730L440 570L610 610L790 435L960 475L1120 305L1280 345L1480 135" stroke="#4c6fbb" strokeOpacity=".25" strokeWidth="3" />
        <path d="M-40 840L150 785L320 805L510 665L700 700L885 545L1050 565L1230 405L1480 325" stroke="#1f2a79" strokeOpacity=".15" strokeWidth="2" strokeDasharray="8 10" />
        <g fill="#eef2fb" stroke="#4c6fbb" strokeOpacity=".35" strokeWidth="2"><circle cx="130" cy="695" r="6" /><circle cx="280" cy="730" r="6" /><circle cx="1120" cy="305" r="6" /><circle cx="1280" cy="345" r="6" /></g>
      </svg>
      <header className={styles.header}>
        <Link href="/" className={styles.back}>
          <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Back to FinSight
        </Link>
        <Image src="/tsh.png" alt="TSH Group" width={112} height={30} priority />
      </header>
      <div className={styles.stage}>
        <section aria-label="FinSight account" className={styles.card}>
          <Image src="/FinSight_logo.png" alt="FinSight" width={156} height={52} priority className={styles.logo} />
          {children}
        </section>
      </div>
      <footer className={styles.footer}>Financial clarity, when you need it. <span className="mx-1" aria-hidden="true">·</span> FinSight for TSH Group</footer>
    </main>
  );
}
