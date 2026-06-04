import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const monthStart = new Date();
  monthStart.setDate(1);
  const monthStartISO = monthStart.toISOString().slice(0, 10);

  const [{ count: siteCount }, { count: resultCount }, { count: monthCount }] =
    await Promise.all([
      supabase.from("test_sites").select("*", { count: "exact", head: true }),
      supabase.from("test_results").select("*", { count: "exact", head: true }),
      supabase
        .from("test_results")
        .select("*", { count: "exact", head: true })
        .gte("date_collected", monthStartISO),
    ]);

  const stats = [
    { label: "Testing sites", value: siteCount ?? 0, href: "/sites" },
    { label: "Total results", value: resultCount ?? 0, href: "/results" },
    { label: "Results this month", value: monthCount ?? 0, href: "/results" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          Welcome{profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}
        </h1>
        <Link href="/results/new" className="btn">
          Record a sample
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card hover:border-river-500">
            <div className="text-3xl font-bold text-river-700">{s.value}</div>
            <div className="text-sm text-gray-500">{s.label}</div>
          </Link>
        ))}
      </div>

      <div className="card">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Quick actions</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/results/new" className="btn-secondary">Record a sample</Link>
          <Link href="/sites/new" className="btn-secondary">Add a site</Link>
          <Link href="/sites" className="btn-secondary">Browse sites</Link>
        </div>
      </div>
    </div>
  );
}
