import { AppShell } from "@/components/AppShell";
import type { MemberOrg } from "@/components/RiverSwitcher";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  // The member's rivers for the header switcher (B4). Single-org members get one entry (just a label).
  const supabase = await createClient();
  const { data: orgRows } = await supabase.rpc("my_orgs");
  const orgs: MemberOrg[] = (orgRows ?? []).map((o) => ({
    organisation_id: o.organisation_id,
    label: o.portal_name ?? o.river_name ?? o.org_name,
    is_active: o.is_active,
  }));

  return (
    <AppShell name={profile.full_name ?? "Account"} isAdmin={profile.role === "admin"} orgs={orgs}>
      {children}
    </AppShell>
  );
}
