"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { AuthState } from "./actions";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 w-full rounded-lg bg-brand-red px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-red-dark disabled:opacity-60"
    >
      {pending ? "Please wait…" : label}
    </button>
  );
}

type Props = {
  mode: "login" | "signup";
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
  next?: string;
  notice?: string;
};

export function AuthForm({ mode, action, next, notice }: Props) {
  const [state, formAction] = useActionState<AuthState, FormData>(
    action,
    undefined,
  );
  const isLogin = mode === "login";

  return (
    <div>
      <div className="mb-6 text-center">
        <h1 className="text-xl font-semibold text-brand-navy">
          {isLogin ? "Sign in to FinSight" : "Create your FinSight account"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {isLogin
            ? "Enter your credentials to continue."
            : "Use your work email to get started."}
        </p>
      </div>

      {notice && (
        <p className="mb-4 rounded-lg bg-brand-blue-light px-3 py-2 text-sm text-brand-navy">
          {notice}
        </p>
      )}

      <form action={formAction} className="flex flex-col gap-3">
        {next && <input type="hidden" name="next" value={next} />}

        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/30"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Password
          <input
            name="password"
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            required
            minLength={isLogin ? undefined : 8}
            className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/30"
          />
        </label>

        {state?.error && (
          <p className="text-sm text-brand-red">{state.error}</p>
        )}

        <SubmitButton label={isLogin ? "Sign in" : "Sign up"} />
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        {isLogin ? (
          <>
            No account?{" "}
            <Link href="/signup" className="font-medium text-brand-blue hover:underline">
              Sign up
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-brand-blue hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
