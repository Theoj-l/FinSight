import type { Metadata } from "next";
import { PageHeading } from "@/app/components/app-page";
import { requireUser } from "@/lib/auth/require-user";
import { SettingsPanel } from "@/app/settings/settings-panel";

export const metadata: Metadata = {
  title: "Settings | FinSight",
  description: "Manage your FinSight account and preferences.",
};

export default async function SettingsPage() {
  const user = await requireUser("/settings");

  return (
    <>
      <PageHeading eyebrow="Workspace preferences" title="Settings" description="Manage your account, notifications, shared thresholds, budgets, and forecasts." />
      <SettingsPanel email={user.email ?? "Finance user"} userId={user.id} />
    </>
  );
}
