import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getClaims: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getClaims: mocks.getClaims } }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); },
}));

import LoginPage from "../(auth)/login/page";
import SignupPage from "../(auth)/signup/page";
import LandingPage from "../page";
import { requireUser } from "@/lib/auth/require-user";

beforeEach(() => { mocks.getClaims.mockReset(); });

describe("authentication routing", () => {
  it("redirects an authenticated visitor away from login to Home", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    await expect(LoginPage({ params: Promise.resolve({}), searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT:/home");
  });

  it("preserves the authenticated landing-page redirect", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    await expect(LandingPage()).rejects.toThrow("NEXT_REDIRECT:/home");
  });

  it("redirects authenticated users away from registration", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    await expect(SignupPage()).rejects.toThrow("NEXT_REDIRECT:/home");
  });

  it("enforces page access on the server when no authenticated user exists", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: new Error("Auth session missing!") });
    await expect(requireUser("/reports")).rejects.toThrow("NEXT_REDIRECT:/login?next=%2Freports");
  });

  it("returns the verified user to protected server pages", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1", email: "finance@example.com" } } });
    await expect(requireUser("/reports")).resolves.toEqual({ id: "user-1", email: "finance@example.com" });
  });
});
