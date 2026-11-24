import { requireModerator } from "@/lib/auth";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { emailConfigured } from "@/lib/email";
import { GROUP_KIND_LABEL, STATUS_LABEL, type AdoptionRequest } from "@/lib/adoption";
import { AdoptionDecision, RetryInvitation } from "@/components/AdoptionReview";

// River Hub moderators' queue for adopt-a-river requests (migration 0107). Pending requests first,
// with everything a moderator needs to check the group; then recent decisions.
export const dynamic = "force-dynamic";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function AdoptionsPage() {
  await requireModerator();
  const supabase = await createClient();
  const { data } = await supabase
    .from("adoption_requests" as never)
    .select("*")
    .order("created_at" as never, { ascending: false })
    .limit(200);
  const rows = (data as unknown as AdoptionRequest[]) ?? [];

  // River names: moderators can't read other rivers' organisation rows under RLS, so look them up here.
  const admin = createAdminClient();
  const ids = [...new Set(rows.map((r) => r.organisation_id))];
  const { data: orgs } = ids.length
    ? await admin.from("organisations").select("id, river_name, river_slug, steward, name").in("id", ids)
    : { data: [] };
  const orgById = new Map(((orgs as { id: string; river_name: string | null; river_slug: string | null; steward: string; name: string }[]) ?? []).map((o) => [o.id, o]));

  const pending = rows.filter((r) => r.status === "pending");
  const decided = rows.filter((r) => r.status !== "pending").slice(0, 50);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">River adoption requests</h1>
        <p className="mt-1 text-sm text-gray-600">
          Groups asking to look after a river on River Hub. Approving names the group on the river&rsquo;s pages and
          invites the contact as the river&rsquo;s first admin.
          {!emailConfigured() && " Branded email isn't set up (RESEND_API_KEY, RESEND_FROM), so there are no alert emails, and invitations use Supabase's standard email."}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Waiting for review ({pending.length})</h2>
        {pending.length === 0 && <p className="card text-sm text-gray-600">Nothing waiting. New requests appear here, and the menu shows a count.</p>}
        {pending.map((r) => {
          const o = orgById.get(r.organisation_id);
          const riverName = o?.river_name ?? "river";
          const others = pending.filter((x) => x.organisation_id === r.organisation_id && x.id !== r.id).length;
          return (
            <article key={r.id} className="card space-y-3">
              <header className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base font-semibold">
                  {r.group_name} <span className="font-normal text-gray-500">for the</span>{" "}
                  {o?.river_slug ? <a className="text-river-700 underline" href={`/r/${o.river_slug}/explore/spills`} target="_blank" rel="noreferrer">{riverName}</a> : riverName}
                </h3>
                <span className="text-xs text-gray-500">Received {fmt(r.created_at)}</span>
              </header>
              {o?.steward === "group" && (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{o.name} already looks after this river.</p>
              )}
              {others > 0 && (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {others} other {others === 1 ? "request is" : "requests are"} waiting for this river.
                </p>
              )}
              <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                <div><dt className="text-gray-500">Kind of group</dt><dd>{GROUP_KIND_LABEL[r.group_kind]}{r.charity_number ? ` · No. ${r.charity_number}` : ""}</dd></div>
                <div><dt className="text-gray-500">Website</dt><dd>{r.website ? <a className="break-all text-river-700 underline" href={r.website} target="_blank" rel="noreferrer nofollow">{r.website}</a> : "None given"}</dd></div>
                <div><dt className="text-gray-500">Contact</dt><dd>{r.contact_name}, {r.contact_role}</dd></div>
                <div><dt className="text-gray-500">Email and phone</dt><dd><a className="text-river-700 underline" href={`mailto:${r.email}`}>{r.email}</a>{r.phone ? ` · ${r.phone}` : ""}</dd></div>
                {r.how_heard && <div className="sm:col-span-2"><dt className="text-gray-500">How they heard</dt><dd>{r.how_heard}</dd></div>}
              </dl>
              <div>
                <h4 className="text-sm text-gray-500">About the group</h4>
                <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed">{r.about}</p>
              </div>
              <AdoptionDecision id={r.id} groupName={r.group_name} riverName={riverName} />
            </article>
          );
        })}
      </section>

      {decided.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Recent decisions</h2>
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr><th className="px-3 py-2">Group</th><th className="px-3 py-2">River</th><th className="px-3 py-2">Decision</th><th className="px-3 py-2">Account</th></tr>
              </thead>
              <tbody>
                {decided.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100 align-top">
                    <td className="px-3 py-2">{r.group_name}<div className="text-xs text-gray-500">{r.email}</div></td>
                    <td className="px-3 py-2">{orgById.get(r.organisation_id)?.river_name ?? "—"}</td>
                    <td className="px-3 py-2">{STATUS_LABEL[r.status]}{r.decided_at ? <div className="text-xs text-gray-500">{fmt(r.decided_at)}</div> : null}{r.moderator_note ? <div className="text-xs text-gray-500">“{r.moderator_note}”</div> : null}</td>
                    <td className="px-3 py-2">
                      {r.status !== "approved" ? "—" : r.invited_user_id ? <span className="text-emerald-700">Invited</span> : <RetryInvitation id={r.id} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
