import Link from "next/link";
import { requireEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { RequestForm } from "@/components/requests/RequestForm";

export const metadata = { title: "New request — River Hub" };

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ template?: string; asset?: string }> }) {
  const profile = await requireEditor();
  const sp = await searchParams;
  const orgId = profile.active_organisation_id ?? profile.organisation_id;
  const supabase = await createClient();
  const [{ data: org }, { data: assets }] = await Promise.all([
    supabase.from("organisations").select("river_name, company_name, river_slug, name").eq("id", orgId).single(),
    supabase.from("sewage_assets").select("id, asset_name, asset_type").eq("organisation_id", orgId).order("asset_name"),
  ]);

  return (
    <div className="max-w-3xl space-y-4">
      <Link href="/requests" className="text-sm text-river-700 hover:underline">← All requests</Link>
      <h1 className="text-xl font-semibold">New information request</h1>
      <p className="text-sm text-gray-500">
        Pick a template, check the letter, then send it. Sending through WhatDoTheyKnow is the easiest route: the
        request and every reply are published there automatically, and you won&rsquo;t need to upload anything here.
      </p>
      <RequestForm
        river={org?.river_name ?? org?.name ?? "the river"}
        company={org?.company_name ?? null}
        assets={(assets ?? []).map((a) => ({ id: a.id, name: a.asset_name, type: a.asset_type }))}
        initialTemplate={sp.template ?? null}
        initialAssetId={sp.asset ?? null}
      />
    </div>
  );
}
