"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { attachGroup, createGroup, detachGroup, inviteToGroup, setLive } from "@/app/(app)/platform/actions";
import { BASE_ROLE_LABELS, BASE_ROLES, type BaseRole } from "@/lib/tasks";

type Res = { ok?: boolean; error?: string; note?: string };
export type GroupOption = { id: string; name: string };
export type RiverOption = { id: string; name: string };

function useRun() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  async function run(fn: () => Promise<Res>, okText?: string): Promise<boolean> {
    setBusy(true);
    setMsg(null);
    const res = await fn();
    setBusy(false);
    if (res.error) { setMsg({ text: res.error, error: true }); return false; }
    if (res.note || okText) setMsg({ text: res.note ?? okText! });
    router.refresh();
    return true;
  }
  const Msg = () => (msg ? <p className={`mt-1 break-all text-xs ${msg.error ? "text-red-600" : "text-green-700"}`}>{msg.text}</p> : null);
  return { busy, run, Msg };
}

export function LiveToggle({ orgId, live, name }: { orgId: string; live: boolean; name: string }) {
  const { busy, run, Msg } = useRun();
  return (
    <div>
      <button
        className={live ? "btn-secondary py-1 text-xs" : "btn py-1 text-xs"}
        disabled={busy}
        onClick={() => {
          if (confirm(live ? `Take the ${name} offline? Its public pages will stop showing.` : `Take the ${name} live? Its public pages will appear on River Hub.`))
            run(() => setLive(orgId, !live));
        }}
      >
        {busy ? "…" : live ? "Take offline" : "Take live"}
      </button>
      <Msg />
    </div>
  );
}

/** A river's groups: detach, attach an existing group, or create one. */
export function RiverGroups({ orgId, riverName, attached, allGroups }: { orgId: string; riverName: string; attached: GroupOption[]; allGroups: GroupOption[] }) {
  const { busy, run, Msg } = useRun();
  const [pick, setPick] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [web, setWeb] = useState("");
  const others = allGroups.filter((g) => !attached.some((a) => a.id === g.id));
  return (
    <div className="space-y-1 text-xs">
      {attached.map((g) => (
        <div key={g.id} className="flex items-center gap-2">
          <span className="text-gray-800">{g.name}</span>
          <button className="text-red-700 hover:underline" disabled={busy}
            onClick={() => { if (confirm(`Take ${g.name} off the ${riverName}? Its results stay; its members lose write access there.`)) run(() => detachGroup(g.id, orgId)); }}>
            remove
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-1">
        {others.length > 0 && (
          <>
            <select className="input py-0.5 text-xs" aria-label={`Add a group to the ${riverName}`} value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Add a group…</option>
              {others.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            {pick && <button className="btn py-0.5 text-xs" disabled={busy} onClick={async () => { if (await run(() => attachGroup(pick, orgId))) setPick(""); }}>Add</button>}
          </>
        )}
        <button className="text-river-700 hover:underline" onClick={() => setCreating((c) => !c)}>{creating ? "cancel" : "new group"}</button>
      </div>
      {creating && (
        <div className="space-y-1 rounded border border-gray-200 p-2">
          <input className="input w-full py-0.5 text-xs" placeholder="Group name" value={name}
            onChange={(e) => { setName(e.target.value); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)); }} />
          <input className="input w-full py-0.5 text-xs" placeholder="web address (slug)" value={slug} onChange={(e) => setSlug(e.target.value)} />
          <input className="input w-full py-0.5 text-xs" placeholder="Website (optional)" value={web} onChange={(e) => setWeb(e.target.value)} />
          <button className="btn py-0.5 text-xs" disabled={busy || !name || !slug}
            onClick={async () => { if (await run(() => createGroup({ name, slug, website: web, orgId }), "Group created")) { setCreating(false); setName(""); setSlug(""); setWeb(""); } }}>
            Create and add
          </button>
        </div>
      )}
      <Msg />
    </div>
  );
}

/** Invite someone to a group on one of its rivers (usually the lead). */
export function InviteToGroup({ groupId, rivers }: { groupId: string; rivers: RiverOption[] }) {
  const { busy, run, Msg } = useRun();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<BaseRole>("lead");
  const [org, setOrg] = useState(rivers[0]?.id ?? "");
  if (!rivers.length) return <span className="text-xs text-gray-400">Add a river first</span>;
  if (!open) return <button className="text-xs text-river-700 hover:underline" onClick={() => setOpen(true)}>Invite someone</button>;
  return (
    <div className="space-y-1 rounded border border-gray-200 p-2 text-xs">
      <input className="input w-full py-0.5 text-xs" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="input w-full py-0.5 text-xs" placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="flex gap-1">
        <select className="input py-0.5 text-xs" aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as BaseRole)}>
          {BASE_ROLES.map((r) => <option key={r} value={r}>{BASE_ROLE_LABELS[r]}</option>)}
        </select>
        {rivers.length > 1 && (
          <select className="input py-0.5 text-xs" aria-label="Lands on river" value={org} onChange={(e) => setOrg(e.target.value)}>
            {rivers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        )}
      </div>
      <div className="flex gap-2">
        <button className="btn py-0.5 text-xs" disabled={busy || !email}
          onClick={async () => { if (await run(() => inviteToGroup({ groupId, orgId: org, email, name, role }), "Invitation sent")) { setEmail(""); setName(""); } }}>
          Send invitation
        </button>
        <button className="btn-secondary py-0.5 text-xs" onClick={() => setOpen(false)}>Close</button>
      </div>
      <Msg />
    </div>
  );
}

/** Attach a group to another river, or take it off one (groups page). */
export function GroupRivers({ groupId, groupName, attached, allRivers }: { groupId: string; groupName: string; attached: RiverOption[]; allRivers: RiverOption[] }) {
  const { busy, run, Msg } = useRun();
  const [pick, setPick] = useState("");
  const others = allRivers.filter((r) => !attached.some((a) => a.id === r.id));
  return (
    <div className="space-y-1 text-xs">
      {attached.map((r) => (
        <div key={r.id} className="flex items-center gap-2">
          <span className="text-gray-800">{r.name}</span>
          <button className="text-red-700 hover:underline" disabled={busy}
            onClick={() => { if (confirm(`Take ${groupName} off the ${r.name}? Its results stay; its members lose write access there.`)) run(() => detachGroup(groupId, r.id)); }}>
            remove
          </button>
        </div>
      ))}
      <div className="flex items-center gap-1">
        <select className="input py-0.5 text-xs" aria-label={`Add a river to ${groupName}`} value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Add a river…</option>
          {others.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        {pick && <button className="btn py-0.5 text-xs" disabled={busy} onClick={async () => { if (await run(() => attachGroup(groupId, pick))) setPick(""); }}>Add</button>}
      </div>
      <Msg />
    </div>
  );
}

/** Create a group with no river yet (groups page). */
export function NewGroupForm() {
  const { busy, run, Msg } = useRun();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [web, setWeb] = useState("");
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); if (await run(() => createGroup({ name, slug, website: web }), "Group created")) { setName(""); setSlug(""); setWeb(""); } }}>
      <div><label className="label" htmlFor="ng-name">Name</label>
        <input id="ng-name" className="input" required value={name}
          onChange={(e) => { setName(e.target.value); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)); }} /></div>
      <div><label className="label" htmlFor="ng-slug">Web address</label>
        <input id="ng-slug" className="input" required value={slug} onChange={(e) => setSlug(e.target.value)} /></div>
      <div><label className="label" htmlFor="ng-web">Website (optional)</label>
        <input id="ng-web" className="input" value={web} onChange={(e) => setWeb(e.target.value)} /></div>
      <button type="submit" className="btn" disabled={busy}>Create group</button>
      <div className="w-full"><Msg /></div>
    </form>
  );
}
