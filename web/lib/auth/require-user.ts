import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SessionUser = { id: string; email?: string };

/**
 * The signed-in user, or null.
 *
 * getClaims() verifies the session JWT locally against the project's
 * asymmetric signing keys (fetched once and cached), so pages no longer wait on
 * a round trip to Supabase Auth as getUser() did. proxy.ts has already
 * refreshed an expiring session on this request. Deduplicated per request.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : undefined };
});

export async function requireUser(nextPath: string) {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}
