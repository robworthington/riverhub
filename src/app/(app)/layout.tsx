import { AppShell } from "@/components/AppShell";
import { requireProfile } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();
  return (
    <AppShell name={profile.full_name ?? "Account"} isAdmin={profile.role === "admin"}>
      {children}
    </AppShell>
  );
}
