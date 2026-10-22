import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/financial/settings-data", () => ({
  readPlanningSettings: mocks.read,
  writePlanningSettings: mocks.write,
}));
import { GET, PUT } from "./route";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "actor" } } });
  mocks.read.mockResolvedValue({
    notificationSource: "previous",
    budgets: [{ id: "9007199254740993" }],
  });
});
const request = (value: unknown) =>
  new Request("http://localhost/api/financial-settings", {
    method: "PUT",
    body: JSON.stringify(value),
  });
it("requires authentication for reads and writes before touching data", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null } });
  expect(
    (await GET(new Request("http://localhost/api/financial-settings"))).status,
  ).toBe(401);
  expect((await PUT(request({ kind: "source", source: "auto" }))).status).toBe(
    401,
  );
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.write).not.toHaveBeenCalled();
});
it("reads explicit scope with no shared cache and safe string IDs", async () => {
  const r = await GET(
    new Request(
      "http://localhost/api/financial-settings?department=HL&period=202601&budgetId=1",
    ),
  );
  expect(r.status).toBe(200);
  expect(r.headers.get("Cache-Control")).toBe("private, no-store");
  expect(mocks.read).toHaveBeenCalledWith("HL", 202601, "1", undefined);
  expect((await r.json()).budgets[0].id).toBe("9007199254740993");
});
it.each(["period=202613", "department=", "budgetId=oops", "budgetId=1e2", "businessType=Unknown", "businessType="])(
  "rejects invalid GET scope %s",
  async (q) => {
    expect(
      (await GET(new Request(`http://localhost/api/financial-settings?${q}`)))
        .status,
    ).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  },
);
it("validates a source write and attributes it to the authenticated user", async () => {
  const r = await PUT(
    request({ kind: "source", source: "budget", budgetId: "1" }),
  );
  expect(r.status).toBe(200);
  expect(mocks.write).toHaveBeenCalledWith(
    { kind: "source", source: "budget", budgetId: "1" },
    "actor",
  );
});
it("rejects malformed JSON and invalid amounts without writing", async () => {
  expect(
    (
      await PUT(
        new Request("http://localhost/api/financial-settings", {
          method: "PUT",
          body: "{",
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await PUT(
        request({
          kind: "manual",
          department: "HL",
          period: 202601,
          revenue: "NaN",
          netProfit: "0",
        }),
      )
    ).status,
  ).toBe(400);
  expect(mocks.write).not.toHaveBeenCalled();
});
it("returns useful stale-scope errors and hides private database error details", async () => {
  mocks.write.mockRejectedValue(new RangeError("Unknown budget scenario."));
  const stale = await PUT(
    request({ kind: "source", source: "budget", budgetId: "1" }),
  );
  expect(stale.status).toBe(400);
  expect((await stale.json()).message).toContain("Unknown budget");
  mocks.read.mockRejectedValue(new Error("secret connection credentials"));
  const failed = await GET(
    new Request("http://localhost/api/financial-settings"),
  );
  expect(failed.status).toBe(503);
  expect(await failed.text()).not.toContain("secret");
  mocks.write.mockRejectedValue(new Error("secret credentials"));
  const failedWrite = await PUT(request({ kind: "source", source: "auto" }));
  expect(failedWrite.status).toBe(503);
  expect(await failedWrite.text()).not.toContain("secret");
});

it("passes business-type scope to the read-only summary loader", async () => {
  const response = await GET(new Request("http://localhost/api/financial-settings?businessType=Bulk&period=202608"));
  expect(response.status).toBe(200);
  expect(mocks.read).toHaveBeenCalledWith(undefined,202608,undefined,"Bulk");
  expect(mocks.write).not.toHaveBeenCalled();
});
