import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireEditor } from "@/lib/auth";
import { ImportWizard } from "@/components/ImportWizard";
import type { TestSite, TestType } from "@/lib/types";

export default async function ImportResultsPage() {
  await requireEditor();
  const supabase = await createClient();
  const [{ data: sites }, { data: testTypes }] = await Promise.all([
    supabase.from("test_sites").select("id, name").order("name"),
    supabase.from("test_types").select("id, test_name").order("test_name"),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Import results</h1>
        <Link href="/results" className="btn-secondary">Back to results</Link>
      </div>
      <p className="text-sm text-gray-500">
        Upload a spreadsheet (.xlsx) or CSV of results for one site. One row per sampling visit; columns
        such as <em>Date, Time, E.Coli, IE, Weather, Rain 48hrs</em> are recognised automatically.
        Re-uploading the same file updates rather than duplicates.
      </p>
      <div className="card">
        <ImportWizard
          sites={(sites as Pick<TestSite, "id" | "name">[]) ?? []}
          testTypes={(testTypes as Pick<TestType, "id" | "test_name">[]) ?? []}
        />
      </div>
    </div>
  );
}
