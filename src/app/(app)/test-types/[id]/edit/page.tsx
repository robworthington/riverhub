import { notFound } from "next/navigation";
import { TestTypeForm } from "@/components/TestTypeForm";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { TestType } from "@/lib/types";

export default async function EditTestTypePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("test_types").select("*").eq("id", id).single();
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Edit test type</h1>
      <div className="card">
        <TestTypeForm testType={data as TestType} />
      </div>
    </div>
  );
}
