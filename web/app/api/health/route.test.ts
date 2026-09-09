import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("GET /api/health", () => {
  it("reports the web service as ok", async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", service: "web" });
  });
});
