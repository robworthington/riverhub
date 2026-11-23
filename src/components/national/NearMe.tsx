"use client";

import Link from "next/link";
import { useId, useState } from "react";

type Near = {
  slug: string;
  river_name: string;
  district_name: string | null;
  company_name: string | null;
  gaps: number;
  overflows: number;
  distance_km: number;
};

// Beyond this, the "nearest" covered river isn't really the visitor's river: say the area isn't
// covered yet rather than send them 100 km away.
const LOCAL_KM = 25;

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy";

/** "Near me": find covered rivers by postcode or the browser's location (via /api/public/rivers-near). */
export function NearMe({ onPick }: { onPick?: (slug: string) => void }) {
  const inputId = useId();
  const statusId = useId();
  const [postcode, setPostcode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ label: string | null; rivers: Near[] } | null>(null);

  async function run(query: string, label: string | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/rivers-near?${query}`, { cache: "no-store" });
      const body = (await res.json()) as { label?: string | null; rivers?: Near[]; error?: string };
      if (!res.ok || !body.rivers) {
        setResult(null);
        setError(body.error ?? "Something went wrong. Please try again.");
      } else {
        setResult({ label: body.label ?? label, rivers: body.rivers });
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function byPostcode(e: React.FormEvent) {
    e.preventDefault();
    const pc = postcode.trim();
    if (!pc) return;
    void run(`postcode=${encodeURIComponent(pc)}`, pc.toUpperCase());
  }

  function byLocation() {
    if (!navigator.geolocation) {
      setError("Your browser can't share its location. Try a postcode instead.");
      return;
    }
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => void run(`lat=${pos.coords.latitude.toFixed(3)}&lng=${pos.coords.longitude.toFixed(3)}`, "your location"),
      () => {
        setBusy(false);
        setError("Location wasn't shared. Try a postcode instead.");
      },
      { maximumAge: 600000, timeout: 10000 },
    );
  }

  const local = result?.rivers.filter((r) => r.distance_km <= LOCAL_KM) ?? [];
  const nearest = result?.rivers[0];

  return (
    <div className="space-y-4 rounded-[6px] border border-brand-line2 bg-brand-surface px-5 py-5">
      <div className="flex flex-wrap items-end gap-3">
        <form onSubmit={byPostcode} className="flex min-w-[240px] flex-1 flex-wrap items-end gap-2">
          <div className="flex min-w-[160px] flex-1 flex-col gap-1.5">
            <label htmlFor={inputId} className="text-[13px] font-semibold text-brand-navyDeep">Your postcode</label>
            <input
              id={inputId}
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              placeholder="e.g. TQ9 5XX or TQ9"
              autoComplete="postal-code"
              aria-describedby={statusId}
              className="h-11 rounded-[5px] border border-brand-line5 bg-white px-3 text-[15px] uppercase focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-navy"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className={`h-11 rounded-[5px] bg-brand-navy px-4 text-[14px] font-semibold text-white hover:bg-brand-navyDeep disabled:opacity-60 ${focusRing}`}
          >
            Find rivers
          </button>
        </form>
        <span className="pb-3 text-[13px] text-brand-label">or</span>
        <button
          type="button"
          onClick={byLocation}
          disabled={busy}
          className={`flex h-11 items-center gap-2 rounded-[5px] border border-brand-line5 bg-white px-4 text-[14px] font-semibold text-brand-navyDeep hover:border-brand-navy disabled:opacity-60 ${focusRing}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
          Use my location
        </button>
      </div>

      <p className="text-[12.5px] leading-[1.5] text-brand-placeholder">
        Postcodes are looked up with postcodes.io (Office for National Statistics data). River Hub rounds the
        location to about 1 km and doesn&rsquo;t store it.
      </p>

      <div id={statusId} role="status" aria-live="polite" className="space-y-3">
        {busy && <p className="text-[14px] text-brand-body">Looking…</p>}
        {error && !busy && <p className="text-[14px] font-semibold text-rh-alarm">{error}</p>}
        {result && !busy && local.length === 0 && nearest && (
          <p className="text-[14px] leading-[1.55] text-brand-body">
            River Hub doesn&rsquo;t cover rivers near {result.label ?? "there"} yet. The nearest covered river,{" "}
            <Link href={`/r/${nearest.slug}/explore/spills`} className="font-semibold text-brand-navy hover:underline">{nearest.river_name}</Link>,
            is {Math.round(nearest.distance_km)} km away.{" "}
            <a href="mailto:hello@riverhub.org?subject=River%20Hub%20—%20cover%20my%20river" className="text-brand-navy hover:underline">Ask us to cover your river →</a>
          </p>
        )}
        {result && !busy && local.length > 0 && (
          <>
            <p className="text-[14px] text-brand-body">
              Rivers with overflows closest to <strong className="text-brand-navyDeep">{result.label ?? "you"}</strong>:
            </p>
            <ol className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {local.map((r) => (
                <li key={r.slug}>
                  <Link
                    href={`/r/${r.slug}/explore/spills`}
                    onClick={() => onPick?.(r.slug)}
                    className={`flex flex-col gap-1.5 rounded-[6px] border border-brand-line2 bg-white px-4 py-3 hover:border-brand-navy ${focusRing}`}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-serif text-[17px] font-bold text-brand-navyDeep">{r.river_name}</span>
                      <span className="shrink-0 font-plexmono text-[12.5px] text-brand-body">{r.distance_km} km</span>
                    </span>
                    <span className="flex flex-wrap gap-x-4 text-[12.5px] text-brand-body">
                      <span><strong className="font-plexmono text-rh-alarm">{r.gaps}</strong> gaps</span>
                      <span><strong className="font-plexmono text-brand-navyDeep">{r.overflows}</strong> overflows</span>
                      {r.district_name && <span className="text-brand-label">{r.district_name}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
