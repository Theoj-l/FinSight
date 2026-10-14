import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), details: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/app/dashboard/data/anomaly-details", () => ({ getAlertDetails: mocks.details }));
import { GET } from "./route";
const request = (id = "acc:6900:202608", query = "") => GET(new Request(`http://localhost/api/anomalies/${id}${query}`), { params: Promise.resolve({ id }) });
beforeEach(() => { vi.resetAllMocks(); mocks.getUser.mockResolvedValue({ data: { user: { id: "user" } } }); });
it("requires authentication before reading evidence", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null } });
  expect((await request()).status).toBe(401);
  expect(mocks.details).not.toHaveBeenCalled();
});
it("validates IDs and bounded positive pages", async () => {
  for (const [id, query] of [["acc:6900:202613", ""], ["bad", ""], ["cust:C01:202608", "?page=-1"], ["cust:C01:202608", "?page=1.5"]]) expect((await request(id, query)).status).toBe(400);
  expect(mocks.details).not.toHaveBeenCalled();
});
it("passes only alert, reason and page to the server-owned scope", async () => {
  mocks.details.mockResolvedValue({ records: [{ id: "9007199254740993" }] });
  const response = await request(undefined, "?reason=duplicate_posting&page=2&unit=OTHER&branch=XX");
  expect(mocks.details).toHaveBeenCalledWith("acc:6900:202608", "duplicate_posting", 2);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect((await response.json()).records[0].id).toBe("9007199254740993");
});
it("reports removed alerts and feed failures", async () => {
  mocks.details.mockResolvedValue(null);
  expect((await request()).status).toBe(404);
  mocks.details.mockRejectedValue(new Error("database"));
  expect((await request()).status).toBe(503);
});
