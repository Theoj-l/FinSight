import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MlServiceError, mlClient } from "./ml-client";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("mlClient", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the ML service /health with the shared-secret header", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: "ok", service: "ml-service" }),
    );

    const result = await mlClient.health();

    expect(result).toEqual({ status: "ok", service: "ml-service" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/health$/);
    expect(options.method).toBe("GET");
    expect(options.cache).toBe("no-store");
    expect(options.headers).toMatchObject({
      "content-type": "application/json",
      "x-ml-service-token": expect.any(String),
    });
  });

  it("throws MlServiceError carrying the upstream status on a non-2xx response", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("upstream boom", { status: 503 }),
    );

    const error = await mlClient.health().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MlServiceError);
    expect(error).toMatchObject({ name: "MlServiceError", status: 503 });
    expect((error as MlServiceError).message).toContain("upstream boom");
  });

  it("propagates network errors from fetch", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("network down"));

    await expect(mlClient.health()).rejects.toThrow("network down");
  });

  it("forwards an abort signal to fetch", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: "ok", service: "ml-service" }),
    );
    const controller = new AbortController();

    await mlClient.health(controller.signal);

    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  });
});
