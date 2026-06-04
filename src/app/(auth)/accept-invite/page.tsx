"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">Loading…</p>}>
      <AcceptInvite />
    </Suspense>
  );
}

function AcceptInvite() {
  const router = useRouter();
  const params = useSearchParams();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Establish a session from the invite token in the URL.
  useEffect(() => {
    const supabase = createClient();
    const tokenHash = params.get("token_hash");
    const type = params.get("type") ?? "invite";

    async function verify() {
      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({
          type: type as "invite" | "recovery" | "signup",
          token_hash: tokenHash,
        });
        if (error) {
          setError(error.message);
          return;
        }
      }
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setError("This invite link is invalid or has expired.");
        return;
      }
      setReady(true);
    }
    verify();
  }, [params]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.refresh();
    router.push("/dashboard");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h2 className="text-lg font-semibold">Set your password</h2>
      {!ready && !error && <p className="text-sm text-gray-500">Verifying invite…</p>}
      {ready && (
        <div>
          <label className="label" htmlFor="password">New password</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {ready && (
        <button type="submit" className="btn w-full" disabled={loading}>
          {loading ? "Saving…" : "Save password & continue"}
        </button>
      )}
    </form>
  );
}
