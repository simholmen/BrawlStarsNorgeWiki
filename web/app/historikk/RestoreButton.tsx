"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreEntity } from "@/app/rediger/actions";

/** Admins: bring a deleted page back from its snapshot, then open it. */
export default function RestoreButton({ id }: { id: number }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <span className="auth-inline-form">
      <button
        type="button"
        className="auth-button small"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await restoreEntity(id);
            if (!r.ok) return setError(r.message);
            router.push(r.url);
          })
        }
      >
        {pending ? "…" : "Gjenopprett siden"}
      </button>
      {error && <span className="auth-error">{error}</span>}
    </span>
  );
}
