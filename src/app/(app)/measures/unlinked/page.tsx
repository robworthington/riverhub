import { requireEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UnlinkedMeasuresList, type UnlinkedMeasure } from "@/components/UnlinkedMeasuresList";

export const metadata = { title: "WINEP linking" };

// Members-only worklist of WINEP measures the importer staged for the catchment but could not attach
// to a specific outlet (descriptive-named bathing-water actions, SO-vs-SSO outlet mismatches,
// works-only monitoring). Linking one here writes the same winep_asset_links row as the per-asset
// manager, after which the measure shows on that outlet and on the public register.
export default async function UnlinkedMeasuresPage() {
  await requireEditor();
  const supabase = await createClient();
  // Not yet in the generated Supabase types (added by migration 0079) — cast like other fresh RPCs.
  const { data, error } = await supabase.rpc("measures_awaiting_linking" as never);
  const rows = (data as unknown as UnlinkedMeasure[]) ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Measures awaiting linking</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-600">
          WINEP measures in the catchment that aren&apos;t yet attached to a specific outlet. Link each to
          the right asset and it will show on that outlet&apos;s page and on the public measures register.
          Measures the importer could attach automatically (by water body, works or outlet) don&apos;t
          appear here.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-red-600">Couldn&apos;t load the queue: {error.message}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
          Nothing awaiting linking — every in-scope measure is attached. 🎉
        </p>
      ) : (
        <>
          <p className="text-xs text-gray-500">{rows.length} measure{rows.length === 1 ? "" : "s"} to link.</p>
          <UnlinkedMeasuresList rows={rows} />
        </>
      )}
    </div>
  );
}
