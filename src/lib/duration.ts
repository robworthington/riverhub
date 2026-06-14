// Adaptive duration formatting for spill events (DRY-SPILL-UX-PROPOSAL.md, Phase A).
// Shows the two most-significant non-zero units, scaling by magnitude:
//   >= 1 day  -> "4d 6h"      ( long: "4 days 6 hours" )
//   >= 1 hour -> "6h 12m"
//   >= 1 min  -> "14m 30s"
//   < 1 min   -> "45s"
// Trailing zero units are dropped (e.g. whole minutes render "14m", not "14m 0s").

export function formatDuration(totalSeconds: number | null | undefined, opts: { long?: boolean } = {}): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds)) return "—";
  const s = Math.max(0, Math.round(totalSeconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  const unit = (n: number, short: string, singular: string): string =>
    opts.long ? `${n} ${singular}${n === 1 ? "" : "s"}` : `${n}${short}`;
  const join = (a: string, b: string) => (opts.long ? `${a} ${b}` : `${a} ${b}`);

  if (d > 0) return h > 0 ? join(unit(d, "d", "day"), unit(h, "h", "hour")) : unit(d, "d", "day");
  if (h > 0) return m > 0 ? join(unit(h, "h", "hour"), unit(m, "m", "minute")) : unit(h, "h", "hour");
  if (m > 0) return sec > 0 ? join(unit(m, "m", "minute"), unit(sec, "s", "second")) : unit(m, "m", "minute");
  return unit(sec, "s", "second");
}

/** Seconds for a spill event: precise from start/end timestamps, else from whole minutes. */
export function eventDurationSeconds(
  startIso: string | null,
  endIso: string | null,
  durationMinutes: number | null,
): number | null {
  if (startIso && endIso) {
    const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
    if (Number.isFinite(ms) && ms >= 0) return Math.round(ms / 1000);
  }
  return durationMinutes != null ? durationMinutes * 60 : null;
}

export const formatHours = (hours: number | null | undefined): string =>
  hours == null ? "—" : formatDuration(hours * 3600);
export const formatMinutes = (minutes: number | null | undefined): string =>
  minutes == null ? "—" : formatDuration(minutes * 60);
