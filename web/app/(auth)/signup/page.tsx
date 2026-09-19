import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signup } from "@/app/auth/actions";
import { AuthForm } from "@/app/auth/auth-form";

export default async function SignupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/home");

  return <AuthForm mode="signup" action={signup} />;
}
