"use client";

import { useActionState, useState } from "react";
import type { AdminState } from "./actions";

type Action = (prev: AdminState, formData: FormData) => Promise<AdminState>;

/**
 * One admin action as a small form. With `confirm`, the first click only reveals a second
 * "Ja, ..." button (no browser confirm() dialog).
 */
export default function ActionButton({
  action,
  fields,
  label,
  confirm,
  variant = "",
}: {
  action: Action;
  fields: Record<string, string>;
  label: string;
  confirm?: string;
  variant?: "" | "secondary" | "danger";
}) {
  const [state, formAction, pending] = useActionState<AdminState, FormData>(action, null);
  const [armed, setArmed] = useState(false);

  if (confirm && !armed) {
    return (
      <button type="button" className={`auth-button ${variant}`} onClick={() => setArmed(true)}>
        {label}
      </button>
    );
  }

  return (
    <form action={formAction} className="auth-inline-form">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button type="submit" className={`auth-button ${variant}`} disabled={pending}>
        {pending ? "…" : confirm ?? label}
      </button>
      {confirm && (
        <button type="button" className="auth-button secondary" onClick={() => setArmed(false)} disabled={pending}>
          Avbryt
        </button>
      )}
      {state && !state.ok && <span className="auth-error">{state.message}</span>}
    </form>
  );
}
