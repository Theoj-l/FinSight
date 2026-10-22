import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });
}

describe("GET /api/fx", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks Frankfurter v2 for SGD-based rates and reshapes the rows into a rate map", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([
      { date: "2026-10-22", base: "SGD", quote: "MYR", rate: 3.1945 },
      { date: "2026-10-21", base: "SGD", quote: "USD", rate: 0.78284 },
    ]));

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ base: "SGD", date: "2026-10-22", rates: { SGD: 1, MYR: 3.1945, USD: 0.78284 } });
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.frankfurter.dev/v2/rates?base=SGD&quotes=USD,MYR");
    expect(options).toMatchObject({ next: { revalidate: 86400 } });
  });

  it("returns 502 when the service errors, is unreachable or sends no rates", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 422, message: "invalid currency: XXX" }, { status: 422 }));
    expect((await GET()).status).toBe(502);

    fetchMock.mockRejectedValueOnce(new TypeError("network down"));
    expect((await GET()).status).toBe(502);

    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    expect((await GET()).status).toBe(502);
  });
});
