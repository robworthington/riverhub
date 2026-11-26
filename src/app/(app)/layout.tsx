import { AppShell } from "@/components/AppShell";
import type { MemberOrg } from "@/components/RiverSwitcher";
import { requireProfile, isModerator, canEdit } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sourceSerif, plexSans, plexMono } from "@/app/fonts";

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

  // River Hub moderators (migration 0107) see the adoption queue and its waiting count in the menu.
  const moderator = await isModerator();
  let pendingAdoptions = 0;
  let photoReports = 0;
  if (moderator) {
    const [{ count }, { count: reports }] = await Promise.all([
      supabase.from("adoption_requests" as never).select("id", { count: "exact", head: true }).eq("status" as never, "pending" as never),
      supabase.from("photo_reports" as never).select("id", { count: "exact", head: true }).eq("status" as never, "pending" as never),
    ]);
    pendingAdoptions = count ?? 0;
    photoReports = reports ?? 0;
  }

  return (
    // same type system as the public pages (fonts were only loaded in the public layout)
    <div className={`${sourceSerif.variable} ${plexSans.variable} ${plexMono.variable} members min-h-screen bg-white font-sans text-brand-text`}>
    <AppShell
      name={profile.full_name ?? "Account"}
      isAdmin={profile.role === "admin"}
      canEdit={canEdit(profile.role)}
      orgs={orgs}
      moderator={moderator ? { pending: pendingAdoptions, photoReports } : null}
    >
      {children}
    </AppShell>
    </div>
  );
}
