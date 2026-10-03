"use client";

import styles from "./auth.module.css";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import type { AuthState } from "./actions";

type Props = {
  mode?: "login" | "signup";
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
  next?: string;
  notice?: string;
};


export function AuthForm({ action, next, notice, mode = "login" }: Props) {
  const isLogin = mode === "login";
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, undefined);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state?.error && !pending) {
      errorRef.current?.focus();
    }
  }, [state, pending]);

  return (
    <div>
      <h1 className={styles.title}>{isLogin ? "Welcome back" : "Create an account"}</h1>
      <p className={styles.subtitle}>
        {isLogin ? "Sign in to your financial intelligence workspace." : "Get started with your FinSight workspace."}
      </p>

      {notice && (
        <p role="status" className={styles.notice}>{notice}</p>
      )}

      <form action={formAction} onSubmit={() => setShowPassword(false)} aria-busy={pending} className={styles.form}>
        {next && <input type="hidden" name="next" value={next} />}
        <div>
          <label htmlFor="email" className={styles.label}>Email Address</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@company.com"
            required
            disabled={pending}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(state?.fieldErrors?.email)}
            aria-describedby={state?.fieldErrors?.email ? "email-error" : state?.error ? "auth-error" : undefined}
            className={styles.input}
          />
          {state?.fieldErrors?.email && <p id="email-error" className={styles.fieldError}>{state.fieldErrors.email}</p>}
        </div>

        <div>
          <label htmlFor="password" className={styles.label}>Password</label>
          <div className={styles.password}>
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={isLogin ? "current-password" : "new-password"}
              minLength={isLogin ? undefined : 8}
              required
              disabled={pending}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={Boolean(state?.fieldErrors?.password)}
              aria-describedby={state?.fieldErrors?.password ? "password-error" : state?.error ? "auth-error" : !isLogin ? "password-hint" : undefined}
              className={styles.input}
            />
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-controls="password"
              disabled={pending}
              onClick={() => setShowPassword((visible) => !visible)}
              className={styles.eye}
            >
              {showPassword ? <EyeOff aria-hidden="true" className="h-5 w-5" /> : <Eye aria-hidden="true" className="h-5 w-5" />}
            </button>
          </div>
          {!isLogin && <p id="password-hint" className={styles.hint}>Use at least 8 characters.</p>}
          {state?.fieldErrors?.password && <p id="password-error" className={styles.fieldError}>{state.fieldErrors.password}</p>}
        </div>

        {state?.error && (
          <p id="auth-error" ref={errorRef} tabIndex={-1} role="alert" className={styles.error}>
            {state.error}
          </p>
        )}

        <button type="submit" disabled={pending} className={styles.submit}>
          {pending ? <LoaderCircle aria-hidden="true" className={styles.spinner} /> : null}
          {pending ? (isLogin ? "Signing in…" : "Creating account…") : (isLogin ? "Sign In" : "Create Account")}
          {!pending && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
        </button>
        <span role="status" className={styles.srOnly}>{pending ? "Please wait while we process your request." : ""}</span>
      </form>

      <p className={styles.switch}>
        {isLogin ? "New user? " : "Already have an account? "}
        <Link href={isLogin ? "/signup" : "/login"} className={styles.link}>
          {isLogin ? "Sign up to create an account" : "Sign in"}
        </Link>
      </p>
    </div>
  );
}
