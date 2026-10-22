import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithPassword = vi.fn();
const signUp = vi.fn();
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
const revalidatePath = vi.fn();

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { signInWithPassword, signUp },
  }),
}));

const { login, signup } = await import("./actions");

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  signInWithPassword.mockReset();
  signUp.mockReset();
  redirect.mockClear();
  revalidatePath.mockClear();
});

describe("login", () => {
  it("rejects missing credentials without hitting Supabase", async () => {
    const result = await login(undefined, form({ email: "", password: "" }));

    expect(result).toEqual({
      error: "Check the highlighted fields and try again.",
      fieldErrors: { email: "Enter a valid email address.", password: "Enter your password." },
    });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("maps Supabase errors to a safe message", async () => {
    signInWithPassword.mockResolvedValueOnce({
      error: { message: "Invalid login credentials" },
    });

    const result = await login(
      undefined,
      form({ email: "a@b.com", password: "secret12" }),
    );

    expect(result).toEqual({ error: "Unable to sign in. Check your email and password and try again." });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects to a safe relative `next` on success", async () => {
    signInWithPassword.mockResolvedValueOnce({ error: null });

    await expect(
      login(
        undefined,
        form({ email: "a@b.com", password: "secret12", next: "/reports" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/reports");
  });

  it("ignores an absolute/off-site `next` and falls back to /home", async () => {
    signInWithPassword.mockResolvedValueOnce({ error: null });

    await expect(
      login(
        undefined,
        form({
          email: "a@b.com",
          password: "secret12",
          next: "https://evil.example.com",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/home");
  });

  it.each([undefined, "", "//evil.example.com", "/\\evil.example.com"])("defaults to Home for missing or unsafe next %s", async next => {
    signInWithPassword.mockResolvedValueOnce({ error: null });
    await expect(login(undefined, form({ email: "a@b.com", password: "secret12", ...(next === undefined ? {} : { next }) }))).rejects.toThrow("NEXT_REDIRECT:/home");
  });
});

describe("authentication validation and failures", () => {
  it("rejects malformed email before contacting Supabase", async () => {
    const result = await login(undefined, form({ email: "invalid", password: "secret12" }));
    expect(result?.fieldErrors?.email).toBe("Enter a valid email address.");
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("trims email without changing the password", async () => {
    signInWithPassword.mockResolvedValueOnce({ error: null });
    await expect(login(undefined, form({ email: "  a@b.com  ", password: " secret12 " }))).rejects.toThrow("NEXT_REDIRECT:/home");
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "a@b.com", password: " secret12 " });
  });

  it("does not expose unexpected provider failures", async () => {
    signInWithPassword.mockRejectedValueOnce(new Error("internal host and credentials"));
    expect(await login(undefined, form({ email: "a@b.com", password: "secret12" }))).toEqual({
      error: "Unable to sign in. Check your email and password and try again.",
    });
    expect(redirect).not.toHaveBeenCalled();
  });


});

describe("signup", () => {
  it("validates email and password before contacting Supabase", async () => {
    const result = await signup(undefined, form({ email: "bad", password: "short" }));
    expect(result?.fieldErrors).toEqual({ email: "Enter a valid email address.", password: "Use at least 8 characters." });
    expect(signUp).not.toHaveBeenCalled();
  });
  it("returns a safe error without exposing provider details", async () => {
    signUp.mockResolvedValueOnce({ error: { message: "internal details" } });
    expect(await signup(undefined, form({ email: "a@b.com", password: "secret12" }))).toEqual({ error: "Unable to create an account. Please try again or contact your team." });
  });
  it("handles provider failures safely", async () => {
    signUp.mockRejectedValueOnce(new Error("internal details"));
    expect(await signup(undefined, form({ email: "a@b.com", password: "secret12" }))).toEqual({ error: "Unable to create an account. Please try again or contact your team." });
  });
  it("directs users to check their inbox when confirmation is needed", async () => {
    signUp.mockResolvedValueOnce({ data: { session: null }, error: null });
    await expect(signup(undefined, form({ email: "a@b.com", password: "secret12" }))).rejects.toThrow("NEXT_REDIRECT:/login?checkEmail=1");
  });
  it("opens Home when Supabase creates an authenticated session", async () => {
    signUp.mockResolvedValueOnce({ data: { session: { access_token: "test" } }, error: null });
    await expect(signup(undefined, form({ email: "a@b.com", password: "secret12" }))).rejects.toThrow("NEXT_REDIRECT:/home");
  });
});
