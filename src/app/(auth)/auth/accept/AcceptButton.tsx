"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { acceptInvitation } from "./actions";

export function AcceptButton({ token, id, label }: { token?: string; id?: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        className="btn w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await acceptInvitation({ token, id });
          if (res.error) {
            setError(res.error);
            setBusy(false);
            return;
          }
          router.refresh();
          router.push("/dashboard");
        }}
      >
        {busy ? "Joining…" : label}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
