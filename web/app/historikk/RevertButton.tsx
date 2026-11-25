"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { revertRevision } from "@/app/rediger/actions";

/** Two-step "Tilbakestill" for one field of one change. */
export default function RevertButton({ id }: { id: number }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  if (message) return <span className={message.ok ? "auth-ok" : "auth-error"}>{message.text}</span>;

  if (!armed) {
    return (
      <button type="button" className="auth-button secondary small" onClick={() => setArmed(true)}>
        Tilbakestill
      </button>
    );
  }

  return (
    <span className="auth-inline-form">
      <button
        type="button"
        className="auth-button danger small"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await revertRevision(id);
            setMessage({ ok: r.ok, text: r.message });
            if (r.ok) router.refresh();
          })
        }
      >
        {pending ? "…" : "Ja, sett tilbake til gammel verdi"}
      </button>
      <button type="button" className="auth-button secondary small" onClick={() => setArmed(false)} disabled={pending}>
        Avbryt
      </button>
    </span>
  );
}
