"use client";

import { useActionState, useState } from "react";
import { sendAccessRequest, type RequestState } from "./actions";

export default function RequestForm({ again = false }: { again?: boolean }) {
  const [state, action, pending] = useActionState<RequestState, FormData>(sendAccessRequest, null);
  const [length, setLength] = useState(0);

  return (
    <form action={action} className="auth-form">
      <label htmlFor="message">
        {again ? "Vil du prøve igjen? " : ""}Hvem er du, og hva vil du redigere?
      </label>
      <textarea
        id="message"
        name="message"
        rows={4}
        maxLength={500}
        required
        placeholder="F.eks. «Jeg er Zimma, vil oppdatere min egen side og MZ-sidene.»"
        onChange={(e) => setLength(e.target.value.length)}
      />
      <div className="auth-form-row">
        <span className="auth-small">{length}/500</span>
        <button type="submit" className="auth-button" disabled={pending}>
          {pending ? "Sender …" : "Be om redigeringstilgang"}
        </button>
      </div>
      {state && <p className={state.ok ? "auth-ok" : "auth-error"}>{state.message}</p>}
    </form>
  );
}
