"use client";

import { useEffect, useState } from "react";

const WATCH_KEY = "rh-spill-watchlist";

export function WatchlistButton({ assetId }: { assetId: string }) {
  const [on, setOn] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(WATCH_KEY);
      setOn(raw ? (JSON.parse(raw) as string[]).includes(assetId) : false);
    } catch {
      /* blocked storage */
    }
    setReady(true);
  }, [assetId]);

  function toggle() {
    try {
      const raw = localStorage.getItem(WATCH_KEY);
      const set = new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
      set.has(assetId) ? set.delete(assetId) : set.add(assetId);
      localStorage.setItem(WATCH_KEY, JSON.stringify([...set]));
      setOn(set.has(assetId));
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      onClick={toggle}
      className={`rounded-[3px] border px-[15px] py-2.5 text-[13px] font-semibold ${
        on ? "border-rh-amber bg-[#fbf1de] text-[#8a5a0c]" : "border-[#d5cfc2] bg-rh-card text-rh-ink hover:bg-rh-rowHover"
      } ${ready ? "" : "opacity-0"}`}
    >
      {on ? "★ On your watchlist" : "☆ Add to watchlist"}
    </button>
  );
}
