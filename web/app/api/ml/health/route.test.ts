import { beforeEach, describe, expect, it, vi } from "vitest";

import { MlServiceError } from "@/lib/ml-client";

const health = vi.fn();

vi.mock("@/lib/ml-client", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/ml-client")>();
  return {
    ...actual,
    mlClient: { health: () => health() },
  };
});

// Imported after the mock is registered.
const { GET } = await import("./route");

describe("GET /api/ml/health", () => {
  beforeEach(() => {
    health.mockReset();
  });

  it("returns the ML service payload on success", async () => {
    health.mockResolvedValueOnce({ status: "ok", service: "ml-service" });

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", service: "ml-service" });
  });

  it("maps an MlServiceError to 502", async () => {
    health.mockRejectedValueOnce(new MlServiceError("upstream 503", 503));

    const res = await GET();

    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ status: "error", message: "upstream 503" });
  });

  it("maps an unexpected error to 500", async () => {
    health.mockRejectedValueOnce(new Error("boom"));

    const res = await GET();

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ status: "error", message: "boom" });
  });
});
