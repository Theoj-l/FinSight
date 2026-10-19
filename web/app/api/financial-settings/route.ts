import { createClient } from "@/lib/supabase/server";
import { isPeriod } from "@/lib/financial/types";
import { isBudgetId, validateWrite } from "@/lib/financial/validation";
import {
  readPlanningSettings,
  writePlanningSettings,
} from "@/lib/financial/settings-data";
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
async function user() {
  const client = await createClient();
  return (await client.auth.getUser()).data.user;
}
export async function GET(request: Request) {
  if (!(await user()))
    return json({ message: "Sign in to view company settings." }, 401);
  const q = new URL(request.url).searchParams;
  if (
    (q.has("businessType") && !["Machining", "Bulk"].includes(q.get("businessType")!)) ||
    (q.has("period") && !isPeriod(Number(q.get("period")))) ||
    (q.has("budgetId") && !isBudgetId(q.get("budgetId"))) ||
    (q.has("department") &&
      (!q.get("department") || q.get("department")!.length > 10))
  )
    return json({ message: "Invalid department, month, or scenario." }, 400);
  try {
    return json(
      await readPlanningSettings(
        q.get("department") ?? undefined,
        q.has("period") ? Number(q.get("period")) : undefined,
        q.get("budgetId") ?? undefined,
        q.get("businessType") ?? undefined,
      ),
    );
  } catch (e) {
    return json(
      {
        message:
          e instanceof RangeError
            ? e.message
            : "Company settings could not be loaded. Try again.",
      },
      e instanceof RangeError ? 400 : 503,
    );
  }
}
export async function PUT(request: Request) {
  const actor = await user();
  if (!actor)
    return json({ message: "Sign in to edit company settings." }, 401);
  let input;
  try {
    input = validateWrite(await request.json());
  } catch (e) {
    return json(
      { message: e instanceof Error ? e.message : "Invalid request." },
      400,
    );
  }
  try {
    await writePlanningSettings(input, actor.id);
    return json({
      message:
        "Company settings saved. Other views use these values on their next load.",
    });
  } catch (e) {
    return json(
      {
        message:
          e instanceof RangeError
            ? e.message
            : "Changes could not be saved. Try again.",
      },
      e instanceof RangeError ? 400 : 503,
    );
  }
}
