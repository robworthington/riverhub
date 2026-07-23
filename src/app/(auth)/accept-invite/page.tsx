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

  // Establish a session from the invite link. Supabase can hand it back three ways:
  //  1. an error in the URL hash (#error=…&error_description=…)
  //  2. the session itself in the URL hash (#access_token=…&refresh_token=… — the implicit flow)
  //  3. a token_hash query param we exchange via verifyOtp (PKCE / custom-template flow)
  useEffect(() => {
    const supabase = createClient();

    async function verify() {
      const hash = new URLSearchParams(
        (typeof window !== "undefined" ? window.location.hash : "").replace(/^#/, ""),
      );

      const errDesc = hash.get("error_description") ?? hash.get("error");
      if (errDesc) {
        setError(errDesc.replace(/\+/g, " "));
        return;
      }

      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (error) {
          setError(error.message);
          return;
        }
        // strip the tokens from the address bar once consumed
        window.history.replaceState(null, "", window.location.pathname);
      } else {
        const tokenHash = params.get("token_hash");
        if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            type: (params.get("type") ?? "invite") as "invite" | "recovery" | "signup",
            token_hash: tokenHash,
          });
          if (error) {
            setError(error.message);
            return;
          }
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
