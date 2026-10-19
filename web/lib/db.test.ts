import { afterEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ create: vi.fn(), disconnect: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@prisma/client", () => ({ PrismaClient: class { constructor() { return mock.create(); } } }));
const globalCache = globalThis as unknown as {prisma?: unknown};
afterEach(() => { delete globalCache.prisma; vi.resetModules(); });
it("replaces an old cached client after the schema gains financial delegates", async () => {
  globalCache.prisma = {$disconnect: mock.disconnect};
  const current = {financial_settings:{},financial_manual_forecast:{}};
  mock.create.mockReturnValue(current);
  const {prisma} = await import("./db");
  expect(prisma).toBe(current); expect(mock.disconnect).toHaveBeenCalled();
});
it("reuses a compatible client", async () => {
  const current = {financial_settings:{},financial_manual_forecast:{}};
  globalCache.prisma = current;
  expect((await import("./db")).prisma).toBe(current);
});
it("gives actionable restart guidance if the generated module itself is stale", async () => {
  mock.create.mockReturnValue({});
  await expect(import("./db")).rejects.toThrow("restart the development server");
});
