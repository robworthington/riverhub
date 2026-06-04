import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { TestType } from "@/lib/types";

export default async function TestTypesPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: types } = await supabase.from("test_types").select("*").order("test_name");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Test types</h1>
        <Link href="/test-types/new" className="btn">Add test type</Link>
      </div>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">Unit</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {((types as TestType[]) ?? []).map((t) => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium">{t.test_name}</td>
                <td className="px-4 py-2 capitalize text-gray-500">{t.category ?? "—"}</td>
                <td className="px-4 py-2 text-gray-500">{t.primary_unit ?? "—"}</td>
                <td className="px-4 py-2 text-right">
                  <Link href={`/test-types/${t.id}/edit`} className="text-river-700 hover:underline">Edit</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
