import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/ProfileForm";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin — manages users & reference data",
  volunteer: "Volunteer — can record samples and edit data",
  viewer: "Viewer — read-only",
};

export default async function ProfilePage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const email = auth?.user?.email ?? "—";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">My profile</h1>
      <div className="card">
        <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          <div><dt className="text-xs uppercase text-gray-400">Email</dt><dd className="text-sm text-gray-800">{email}</dd></div>
          <div><dt className="text-xs uppercase text-gray-400">Role</dt><dd className="text-sm text-gray-800">{ROLE_LABEL[profile.role] ?? profile.role}</dd></div>
        </dl>
        <ProfileForm initialName={profile.full_name ?? ""} />
      </div>
    </div>
  );
}
