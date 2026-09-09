import { expect, test } from "@playwright/test";

test.describe("health endpoints", () => {
  test("GET /api/health returns ok", async ({ request }) => {
    const res = await request.get("/api/health");

    expect(res.ok()).toBeTruthy();
    expect(await res.json()).toEqual({ status: "ok", service: "web" });
  });

  test("GET /api/ml/health reports a status", async ({ request }) => {
    const res = await request.get("/api/ml/health");

    // 200 when the ML service is up, 502/500 when it is not reachable — either
    // way the route must answer with a JSON body carrying a `status` field.
    expect([200, 500, 502]).toContain(res.status());
    expect(await res.json()).toHaveProperty("status");
  });
});
