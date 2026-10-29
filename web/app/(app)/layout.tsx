import type { ReactNode } from "react";
import { AppShell } from "@/app/components/app-sidebar";
import { getSessionUser } from "@/lib/auth/require-user";

/**
 * The signed-in app: Home, Dashboard, Assistant, Forecast, Reports, Settings.
 *
 * The sidebar lives here, not in each page, so it stays mounted while moving
 * between pages: only the page area changes, and each page's loading.tsx shows
 * at once while its data loads. The route group "(app)" does not appear in URLs.
 * Page components stay in their feature folders (app/dashboard/components, ...);
 * only the route entry files (page.tsx, loading.tsx) live under app/(app)/.
 *
 * Pages still call requireUser() themselves: proxy.ts redirects signed-out
 * visitors, and the page check is defence in depth with the right ?next= path.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  return <AppShell email={user?.email ?? "Finance user"}>{children}</AppShell>;
}
