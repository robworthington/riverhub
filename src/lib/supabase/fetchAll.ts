// Every row of a query, fetched in pages. The database API returns at most 1,000 rows per request,
// and asking for more with .limit() doesn't lift that, so an unpaged query silently stops at 1,000
// (Analysis counted 1,000 of the Dart's 1,047 E. coli results, Nov 2026).
//
// `make` must build a fresh query each time with a stable order (end the order on a unique column such
// as id), or pages can overlap or skip rows. `max` is a safety stop.

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
type Rangeable<T> = { range: (from: number, to: number) => Page<T> };

export async function fetchAll<T>(make: () => Rangeable<T>, { pageSize = 1000, max = 100_000 } = {}): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += pageSize) {
    const { data, error } = await make().range(from, from + pageSize - 1);
    if (error || !data) break;
    out.push(...data);
    if (data.length < pageSize) break;
  }
  return out;
}
