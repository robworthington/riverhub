import { cachedRpc } from "@/lib/publicData";
import { derive, type BoardRow } from "@/lib/spillStatus";

export type RiverLive = {
  /** Overflows the board lists for this river. */
  total: number;
  spilling: number;
  /** Most recent successful poll across the river's monitors (ISO), or null. */
  asOf: string | null;
};

/** The live-board figures for the current river (prime the river slug first). Reads the same cached RPCs,
 *  with the same arguments, as the board page, so the share card, the board and the share message agree
 *  and the card costs no extra database work. */
export async function riverLive(): Promise<RiverLive> {
  const range = (await cachedRpc<{ max_year: number | null }>("public_spill_year_range"))[0];
  const pYear = range?.max_year ?? new Date().getUTCFullYear();
  const rows = await cachedRpc<BoardRow>("public_spills_board", { p_year: pYear });
  return liveFromRows(rows, Date.now());
}

export function liveFromRows(rows: BoardRow[], nowMs: number): RiverLive {
  let latest: number | null = null;
  let spilling = 0;
  for (const r of rows) {
    if (derive(r, nowMs).status === "spilling") spilling++;
    const t = r.last_updated ? Date.parse(r.last_updated) : NaN;
    if (!Number.isNaN(t) && (latest == null || t > latest)) latest = t;
  }
  return { total: rows.length, spilling, asOf: latest != null ? new Date(latest).toISOString() : null };
}
