"use client";

import { useState, useSyncExternalStore } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";
import { safeNext } from "@/lib/safeNext";

const ERRORS: Record<string, string> = {
  avbrutt: "Innloggingen ble avbrutt. Prøv igjen.",
  feil: "Noe gikk galt under innloggingen. Prøv igjen.",
};

// ?feil= is read in the browser (empty during prerender), so the page itself stays static.
const noSubscribe = () => () => {};
function useUrlError(): string | null {
  const search = useSyncExternalStore(noSubscribe, () => window.location.search, () => "");
  const code = new URLSearchParams(search).get("feil");
  return code ? (ERRORS[code] ?? ERRORS.feil) : null;
}

export default function LoginButton() {
  const [busy, setBusy] = useState(false);
  const urlError = useUrlError();
  const [clickError, setError] = useState<string | null>(null);
  const error = clickError ?? (busy ? null : urlError);

  async function login() {
    setBusy(true);
    setError(null);
    const next = safeNext(new URLSearchParams(window.location.search).get("next"));
    const redirectTo = `${window.location.origin}/auth/callback/?next=${encodeURIComponent(next)}`;
    const { error } = await getBrowserClient().auth.signInWithOAuth({
      provider: "discord",
      options: { redirectTo, scopes: "identify" },
    });
    if (error) {
      setError(ERRORS.feil);
      setBusy(false);
    }
    // On success the browser is already navigating to Discord.
  }

  return (
    <>
      {error && <p className="auth-error">{error}</p>}
      <button type="button" className="auth-button discord" onClick={login} disabled={busy}>
        {busy ? "Sender deg til Discord …" : "Logg inn med Discord"}
      </button>
    </>
  );
}
