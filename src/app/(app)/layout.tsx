import { Nav } from "@/components/Nav";
import { requireProfile } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  return (
    <div className="min-h-screen">
      <Nav isAdmin={profile.role === "admin"} name={profile.full_name ?? "Account"} />
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
