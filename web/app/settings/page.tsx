import type { Metadata } from "next";
import { AppPage, PageHeading } from "@/app/components/app-page";
import { requireUser } from "@/lib/auth/require-user";
import { SettingsPanel } from "./settings-panel";

export const metadata: Metadata = {
  title: "Settings | FinSight",
  description: "Manage your FinSight account and preferences.",
};

export default async function SettingsPage() {
  const user = await requireUser("/settings");
  const email = user.email ?? "Finance user";

  return (
    <AppPage email={email}>
      <PageHeading eyebrow="Workspace preferences" title="Settings" description="Manage your account, notifications, and display preferences." />
      <SettingsPanel email={email} userId={user.id} />
    </AppPage>
  );
}
