import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/require-user";
import { login } from "@/app/auth/actions";
import { AuthForm } from "@/app/auth/auth-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  if (await getSessionUser()) redirect("/home");

  const next = typeof params.next === "string" ? params.next : undefined;
  const notice = params.checkEmail
    ? "Check your inbox to confirm your email, then sign in."
    : params.error === "confirm"
      ? "That confirmation link is invalid or expired. Try signing in."
      : undefined;

  return <AuthForm mode="login" action={login} next={next} notice={notice} />;
}
