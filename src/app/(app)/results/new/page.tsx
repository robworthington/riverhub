import Link from "next/link";
import { ResultForm } from "@/components/ResultForm";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import type { TestType } from "@/lib/types";

export default async function NewResultPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>;
}) {
  const { site } = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: sites }, { data: testTypes }, { data: org }] = await Promise.all([
    supabase.from("test_sites").select("id, name").order("name"),
    supabase.from("test_types").select("*").order("test_name"),
    supabase.from("organisations").select("name").eq("id", profile.organisation_id).single(),
  ]);

  if (!sites?.length) {
    return (
      <div className="mx-auto max-w-lg space-y-3 text-center">
        <h1 className="text-xl font-semibold">Record a sample</h1>
        <p className="text-sm text-gray-500">You need a testing site first.</p>
        <Link href="/sites/new" className="btn">Add a site</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-xl font-semibold">Record a sample</h1>
      <div className="card">
        <ResultForm
          sites={sites}
          testTypes={(testTypes as TestType[]) ?? []}
          defaultSiteId={site}
          defaultPerson={profile.full_name ?? undefined}
          defaultOrg={org?.name ?? undefined}
        />
      </div>
    </div>
  );
}
