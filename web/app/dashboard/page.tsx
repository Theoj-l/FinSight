import { redirect } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // proxy.ts already guards this route; this is defence in depth.
  if (!user) redirect("/login?next=/dashboard");

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4">
        <Image src="/tsh.png" alt="TSH Group" width={116} height={30} />
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-lg border border-black/10 px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-black/[.04]"
          >
            Sign out
          </button>
        </form>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-brand-navy">Dashboard</h1>
        <p className="mt-2 text-muted">
          Signed in as <span className="font-medium text-foreground">{user.email}</span>
        </p>

        <div className="mt-8 rounded-xl border border-black/10 bg-brand-blue-light/60 p-6">
          <p className="text-sm text-brand-navy">
            Auth is wired up. Data models and real dashboard content come next.
          </p>
        </div>
      </main>
    </div>
  );
}
