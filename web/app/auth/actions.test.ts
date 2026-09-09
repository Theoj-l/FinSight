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

    expect(result).toEqual({ error: "Email and password are required." });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("returns the Supabase error message on failed sign-in", async () => {
    signInWithPassword.mockResolvedValueOnce({
      error: { message: "Invalid login credentials" },
    });

    const result = await login(
      undefined,
      form({ email: "a@b.com", password: "secret12" }),
    );

    expect(result).toEqual({ error: "Invalid login credentials" });
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

  it("ignores an absolute/off-site `next` and falls back to /dashboard", async () => {
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
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard");
  });
});

describe("signup", () => {
  it("requires a password of at least 8 characters", async () => {
    const result = await signup(
      undefined,
      form({ email: "a@b.com", password: "short" }),
    );

    expect(result).toEqual({ error: "Password must be at least 8 characters." });
    expect(signUp).not.toHaveBeenCalled();
  });

  it("sends the user to confirm their email when no session is returned", async () => {
    signUp.mockResolvedValueOnce({ data: { session: null }, error: null });

    await expect(
      signup(undefined, form({ email: "a@b.com", password: "secret12" })),
    ).rejects.toThrow("NEXT_REDIRECT:/login?checkEmail=1");
  });

  it("redirects straight to the dashboard when a session exists", async () => {
    signUp.mockResolvedValueOnce({
      data: { session: { access_token: "t" } },
      error: null,
    });

    await expect(
      signup(undefined, form({ email: "a@b.com", password: "secret12" })),
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard");
  });
});
