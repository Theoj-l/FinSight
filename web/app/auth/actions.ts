"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { authDestination } from "@/lib/auth/redirect";

export type AuthState = {
  error: string;
  fieldErrors?: { email?: string; password?: string };
} | undefined;

const SIGN_IN_ERROR = "Unable to sign in. Check your email and password and try again.";

function readCredentials(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  return { email, password };
}

export async function login(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const { email, password } = readCredentials(formData);
  const fieldErrors: NonNullable<AuthState>["fieldErrors"] = {};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fieldErrors.email = "Enter a valid email address.";
  }
  if (!password) fieldErrors.password = "Enter your password.";
  if (Object.keys(fieldErrors).length) {
    return { error: "Check the highlighted fields and try again.", fieldErrors };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: SIGN_IN_ERROR };
  } catch {
    // Never send provider, network or configuration details to the browser.
    return { error: SIGN_IN_ERROR };
  }

  const next = String(formData.get("next") ?? "/home");
  revalidatePath("/", "layout");
  redirect(authDestination(next));
}

export async function signup(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const { email, password } = readCredentials(formData);
  const fieldErrors: NonNullable<AuthState>["fieldErrors"] = {};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = "Enter a valid email address.";
  if (password.length < 8) fieldErrors.password = "Use at least 8 characters.";
  if (Object.keys(fieldErrors).length) return { error: "Check the highlighted fields and try again.", fieldErrors };

  let hasSession = false;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: "Unable to create an account. Please try again or contact your team." };
    hasSession = Boolean(data.session);
  } catch {
    return { error: "Unable to create an account. Please try again or contact your team." };
  }
  if (!hasSession) redirect("/login?checkEmail=1");
  revalidatePath("/", "layout");
  redirect("/home");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
