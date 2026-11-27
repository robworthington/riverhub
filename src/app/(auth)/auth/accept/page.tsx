import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BASE_ROLE_LABELS, type BaseRole } from "@/lib/tasks";
import { AcceptButton } from "./AcceptButton";

// Accept an invitation to a group (migration 0129). Arrive with ?token= from the email, or without one
// after setting a password: then it lists open invitations for the signed-in (confirmed) email.
export const dynamic = "force-dynamic";

type Preview = { status: string; email: string; group_name: string; river_name: string; base_role: BaseRole; invited_by_name: string | null };
type Mine = { id: string; group_name: string; river_name: string; base_role: BaseRole; invited_by_name: string | null; expires_at: string };

const STATUS_TEXT: Record<string, string> = {
  accepted: "This invitation has already been accepted.",
  cancelled: "This invitation was cancelled. Ask the group for a new one.",
  expired: "This invitation has expired. Ask the group to send it again.",
};

export default async function AcceptPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (token) {
    const { data } = await supabase.rpc("invitation_preview" as never, { p_token: token } as never);
    const inv = ((data as unknown as Preview[] | null) ?? [])[0];
    if (!inv) return <Message title="Invitation not found">Check you copied the whole link from the email.</Message>;
    if (inv.status !== "open") return <Message title="Can't accept this invitation">{STATUS_TEXT[inv.status]}</Message>;
    const who = <>{inv.invited_by_name ? `${inv.invited_by_name} has invited you` : "You've been invited"} to join <strong>{inv.group_name}</strong> on the {inv.river_name} as {BASE_ROLE_LABELS[inv.base_role].toLowerCase()}.</>;
    if (!user) {
      const next = `/auth/accept?token=${encodeURIComponent(token)}`;
      return (
        <div className="space-y-3 text-sm">
          <h2 className="text-lg font-semibold">Join {inv.group_name}</h2>
          <p>{who}</p>
          <p>Sign in as <strong>{inv.email}</strong> to accept.</p>
          <Link className="btn block w-full text-center" href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>
          <p className="text-xs text-gray-500">New to River Hub? Use the &ldquo;set your password&rdquo; email we sent you instead.</p>
        </div>
      );
    }
    if (user.email?.toLowerCase() !== inv.email) {
      return (
        <Message title="Different account">
          This invitation is for <strong>{inv.email}</strong>, but you&rsquo;re signed in as {user.email}. Sign out, then sign in with
          the invited address.
        </Message>
      );
    }
    return (
      <div className="space-y-3 text-sm">
        <h2 className="text-lg font-semibold">Join {inv.group_name}</h2>
        <p>{who}</p>
        <AcceptButton token={token} label={`Join ${inv.group_name}`} />
      </div>
    );
  }

  if (!user) redirect("/login?next=%2Fauth%2Faccept");
  const [{ data: mineData }, { data: profile }] = await Promise.all([
    supabase.rpc("my_invitations" as never),
    supabase.from("profiles").select("id").eq("id", user.id).maybeSingle(),
  ]);
  const mine = (mineData as unknown as Mine[] | null) ?? [];
  if (!mine.length) {
    if (profile) redirect("/dashboard");
    return (
      <Message title="No invitation waiting">
        There&rsquo;s no open invitation for {user.email}. Ask the group that invited you to send it again.
      </Message>
    );
  }
  return (
    <div className="space-y-4 text-sm">
      <h2 className="text-lg font-semibold">{mine.length === 1 ? "Your invitation" : "Your invitations"}</h2>
      {mine.map((m) => (
        <div key={m.id} className="space-y-2 rounded border border-gray-200 p-3">
          <p>
            {m.invited_by_name ? `${m.invited_by_name} invited you` : "You've been invited"} to join <strong>{m.group_name}</strong> on
            the {m.river_name} as {BASE_ROLE_LABELS[m.base_role].toLowerCase()}.
          </p>
          <AcceptButton id={m.id} label={`Join ${m.group_name}`} />
        </div>
      ))}
      {profile && <Link href="/dashboard" className="block text-center text-xs text-gray-500 hover:underline">Not now</Link>}
    </div>
  );
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 text-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p>{children}</p>
      <Link href="/dashboard" className="block text-center text-xs text-gray-500 hover:underline">Go to the members&rsquo; area</Link>
    </div>
  );
}
