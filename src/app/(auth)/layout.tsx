import { INSTANCE } from "@/lib/instance";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-river-700">River Hub</h1>
          <p className="text-sm text-gray-500">{INSTANCE.orgName}</p>
        </div>
        <div className="card">{children}</div>
      </div>
    </div>
  );
}
