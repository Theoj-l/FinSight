import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/require-user";
import { signup } from "@/app/auth/actions";
import { AuthForm } from "@/app/auth/auth-form";

export default async function SignupPage() {
  if (await getSessionUser()) redirect("/home");
  return <AuthForm mode="signup" action={signup} />;
}
