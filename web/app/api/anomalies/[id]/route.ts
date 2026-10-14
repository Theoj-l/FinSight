import { createClient } from "@/lib/supabase/server";
import { getAlertDetails } from "@/app/dashboard/data/anomaly-details";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  if (!user) return json({ message: "Sign in to view anomaly evidence." }, 401);
  const { id } = await context.params;
  const url = new URL(request.url);
  const page = url.searchParams.get("page") ?? "1";
  if (!/^(dept|acc|cust):[^:]{1,12}:\d{6}$/.test(id) || !/^[1-9]\d{0,5}$/.test(page) || Number(id.split(":")[2]) % 100 < 1 || Number(id.split(":")[2]) % 100 > 12) return json({ message: "Invalid anomaly or page." }, 400);
  try {
    const details = await getAlertDetails(id, url.searchParams.get("reason"), Number(page));
    return details ? json(details) : json({ message: "This alert is no longer in the current results. Refresh to update your alerts." }, 404);
  } catch (error) {
    return json({ message: error instanceof RangeError ? "Unknown evidence reason." : "Evidence could not be loaded. Try again." }, error instanceof RangeError ? 400 : 503);
  }
}
