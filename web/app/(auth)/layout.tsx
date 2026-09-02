import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 flex justify-center">
          <Image
            src="/tsh.png"
            alt="TSH Group"
            width={132}
            height={35}
            priority
          />
        </Link>

        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm sm:p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
