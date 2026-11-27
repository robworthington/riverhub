"use client";

import { useEffect, useState } from "react";

/**
 * Wraps a card the visitor can close (the petition on the spills page). "local" remembers it across
 * visits; "session" for this visit only. Renders nothing until it knows, so a closed card never flashes.
 */
export function Dismissible({ id, scope = "local", className = "", children, closeLabel = "Close" }: {
  id: string; scope?: "local" | "session"; className?: string; children: React.ReactNode; closeLabel?: string;
}) {
  const [open, setOpen] = useState<boolean | null>(null);
  const key = `rh-dismiss:${id}`;
  useEffect(() => {
    try {
      const store = scope === "local" ? window.localStorage : window.sessionStorage;
      setOpen(store.getItem(key) !== "1");
    } catch {
      setOpen(true);
    }
  }, [key, scope]);
  if (!open) return null;
  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => {
          try { (scope === "local" ? window.localStorage : window.sessionStorage).setItem(key, "1"); } catch { /* private mode */ }
          setOpen(false);
        }}
        aria-label={closeLabel}
        title={closeLabel}
        className="absolute right-2 top-2 z-10 rounded-[3px] px-1.5 text-[18px] leading-none text-rh-ink3 hover:bg-rh-cardAlt hover:text-rh-ink"
      >
        ×
      </button>
      {children}
    </div>
  );
}
