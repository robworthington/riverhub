import { createClient } from "@/lib/supabase/server";
import { canEdit, isModerator, requireProfile } from "@/lib/auth";
import { memberRiver } from "@/lib/memberRiver";
import { derive, type BoardRow, type LiveStatus } from "@/lib/spillStatus";
import { MemberDashboard, plural, type DashboardJob as Job } from "@/components/MemberDashboard";
import { EaSyncButton } from "@/components/EaSyncButton";

// Members' dashboard: what is waiting to be done on the member's river, what they can do, and what the
// river is doing now. Counts come from member_dashboard() (migration 0122), which reads through
// row-level security, so it is always the river the member has switched to.

type Counts = {
  requests_overdue: number; requests_due_soon: number; requests_open: number; requests_drafts: number;
  requests_unloaded: number; photos_pending: number; winep_to_link: number; assets_no_system: number;
  sites_total: number; sites_stale: number; results_month: number;
};
type WorksRow = { verdict: string };
type PinRow = BoardRow & { asset_id: string };


export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const river = await memberRiver(supabase, profile.organisation_id);
  const editor = canEdit(profile.role);
  const admin = profile.role === "admin";
  const moderator = await isModerator();

  const [{ data: countsData }, { data: works }, { data: pins }, mod] = await Promise.all([
    supabase.rpc("member_dashboard" as never),
    supabase.rpc("public_spills_works" as never, { p_org: profile.organisation_id } as never),
    supabase.rpc("public_spill_pins" as never, { p_org: profile.organisation_id } as never),
    moderator
      ? Promise.all([
          supabase.from("adoption_requests" as never).select("id", { count: "exact", head: true }).eq("status" as never, "pending" as never),
          supabase.from("photo_reports" as never).select("id", { count: "exact", head: true }).eq("status" as never, "pending" as never),
        ]).then(([a, p]) => ({ adoptions: a.count ?? 0, reports: p.count ?? 0 }))
      : Promise.resolve({ adoptions: 0, reports: 0 }),
  ]);
  const c = (countsData ?? {}) as Partial<Counts>;
  const n = (k: keyof Counts) => Number(c[k] ?? 0);
  const noPermit = ((works ?? []) as WorksRow[]).filter((w) => w.verdict === "not_assessed").length;
  const nowMs = Date.now();
  const live = ((pins ?? []) as PinRow[]).reduce<Record<LiveStatus, number>>(
    (acc, r) => {
      const s = derive({ ...r, dry: 0, wet: 0, total: 0, pre_stw: 0 }, nowMs).status;
      return { ...acc, [s]: acc[s] + 1 };
    },
    { spilling: 0, recent: 0, ok: 0, nodata: 0 },
  );
  const publicHref = (path: string) => (river.slug ? `/r/${river.slug}/explore${path}` : `/explore${path}`);

  // Jobs, most pressing first. A job with nothing waiting is left out.
  const jobs: Job[] = [
    { key: "overdue", n: n("requests_overdue"), urgent: true, title: `${plural(n("requests_overdue"), "information request")} overdue`,
      detail: "The 20 working days are up. Chase the authority, or ask for an internal review.", href: "/requests", action: "See requests" },
    { key: "due", n: n("requests_due_soon"), title: `${plural(n("requests_due_soon"), "reply", "replies")} due this week`,
      detail: "Check WhatDoTheyKnow for an answer; the request log updates each morning.", href: "/requests", action: "See requests" },
    { key: "unloaded", n: n("requests_unloaded"), title: `${plural(n("requests_unloaded"), "answer")} not yet used`,
      detail: "A reply has come back, but its figures aren't in River Hub yet. Add them, then tick “data loaded”.", href: "/requests", action: "See requests" },
    { key: "drafts", n: n("requests_drafts"), title: `${plural(n("requests_drafts"), "draft request")} not sent`,
      detail: "Open the draft and send it on WhatDoTheyKnow, or delete it.", href: "/requests", action: "See drafts" },
    { key: "permits", n: noPermit, title: `${plural(noPermit, "treatment works", "treatment works")} with no permit loaded`,
      detail: "Without the permit, River Hub can't say whether the works is big enough. Ask the Environment Agency for them.",
      href: "/requests/new?template=permits", action: "Ask for the permits" },
    ...(admin ? [{ key: "photos", n: n("photos_pending"), title: `${plural(n("photos_pending"), "photo")} waiting for approval`,
      detail: "Approve them to show them on the river's public pages, or hide them.", href: "/photos", action: "Review photos" }] : []),
    { key: "winep", n: n("winep_to_link"), title: `${plural(n("winep_to_link"), "WINEP improvement")} to link to an overflow`,
      detail: "Linking shows each planned improvement on the overflow it fixes. Most have a suggested match.", href: "/measures/unlinked", action: "Link them" },
    { key: "nosystem", n: n("assets_no_system"), title: `${plural(n("assets_no_system"), "overflow")} not linked to a sewage system`,
      detail: "Without a system, an overflow is left out of capacity and before-the-works checks.", href: "/assets", action: "See overflows" },
    ...(moderator ? [
      { key: "adoptions", n: mod.adoptions, title: `${plural(mod.adoptions, "adoption request")} to review`,
        detail: "River Hub moderator: someone wants to look after a river.", href: "/admin/adoptions", action: "Review" },
      { key: "reports", n: mod.reports, title: `${plural(mod.reports, "reported photo")} to review`,
        detail: "River Hub moderator: a visitor reported a photo.", href: "/admin/photo-reports", action: "Review" },
    ] : []),
  ].filter((j) => j.n > 0);

  const actions = [
    ...(editor ? [
      { href: "/requests/new", title: "Start an information request", detail: "Pick a template; it's sent from your WhatDoTheyKnow account." },
      { href: "/results/new", title: "Record a sample", detail: "A water-quality result from a sampling site." },
      { href: "/photos", title: "Add a photo", detail: "An overflow, a discharge or the river, for the public pages." },
    ] : []),
    ...(admin ? [{ href: "/admin/users", title: "Invite a member", detail: "Add a volunteer or another admin to this river." }] : []),
    { href: publicHref("/spills"), title: "See the public pages", detail: `What anyone sees for the ${river.riverName}.` },
  ];

  return (
    <MemberDashboard
      river={{ name: river.riverName, group: river.groupName }}
      firstName={profile.full_name ? profile.full_name.split(" ")[0] : null}
      editor={editor}
      jobs={jobs}
      actions={actions}
      live={live}
      publicSpillsHref={publicHref("/spills")}
      sitesStale={n("sites_stale")}
      sitesTotal={n("sites_total")}
      resultsMonth={n("results_month")}
      adminTools={admin ? (
        <div className="space-y-2">
          <p className="max-w-[70ch] text-[14px] leading-[1.55] text-rh-ink2">
            Rain and river flow are fetched from the Environment Agency every hour. To fetch the last 30 days now
            (after adding a gauge, say), use this. The public{" "}
            <a href={publicHref("/spills/why/rain")} className="font-semibold text-rh-teal hover:underline">Rain and river flow</a> page shows the result.
          </p>
          <EaSyncButton />
        </div>
      ) : undefined}
    />
  );
}
