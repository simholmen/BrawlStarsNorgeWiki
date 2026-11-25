"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createEntity } from "@/app/rediger/actions";
import { track } from "@/lib/analytics";
import { slugify } from "@/lib/slugify";
import type { EntityKind } from "@/lib/fields";

// Create a person or club. Only the name is required; everything else can be filled in on the
// page right after (it opens in edit mode). The URL comes from the name and never changes.

export default function NewPageForm({ kind }: { kind: EntityKind }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [bsid, setBsid] = useState("");
  const [hjemsted, setHjemsted] = useState("");
  const [born, setBorn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const slug = slugify(name);
  const base = kind === "person" ? "/personer/" : "/klubber/";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fields: Record<string, string> = { name };
    if (kind === "person") Object.assign(fields, { bsid, hjemsted, born });
    start(async () => {
      const r = await createEntity(kind, fields);
      if (!r.ok) return setError(r.message);
      track("page_created", { kind, url: r.url });
      router.push(`${r.url}?rediger=1`);
    });
  }

  return (
    <>
      <h2>{kind === "person" ? "Ny personside" : "Ny klubbside"}</h2>
      <p className="auth-small">
        {kind === "person" ? (
          <>
            Lager du en klubb? <Link href="/ny/klubb/">Ny klubbside</Link>
          </>
        ) : (
          <>
            Lager du en person? <Link href="/ny/person/">Ny personside</Link>
          </>
        )}
      </p>
      <form className="auth-form" onSubmit={submit}>
        <label htmlFor="name">Navn *</label>
        <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required autoFocus />
        <div className="auth-small">
          Adressen blir <code>{base}{slug || "…"}/</code> og kan ikke endres senere.
        </div>

        {kind === "person" && (
          <>
            <label htmlFor="bsid">Brawl Stars ID</label>
            <input id="bsid" type="text" value={bsid} onChange={(e) => setBsid(e.target.value)} maxLength={20} placeholder="f.eks. YQ29980 (uten #)" />
            <label htmlFor="hjemsted">Hjemsted</label>
            <input id="hjemsted" type="text" value={hjemsted} onChange={(e) => setHjemsted(e.target.value)} maxLength={200} />
            <label htmlFor="born">Født</label>
            <input id="born" type="text" value={born} onChange={(e) => setBorn(e.target.value)} maxLength={200} placeholder="f.eks. 2004" />
          </>
        )}

        {error && <p className="auth-error">{error}</p>}
        <div className="auth-form-row">
          <span className="auth-small">Resten fyller du inn på siden etterpå.</span>
          <button type="submit" className="auth-button" disabled={pending || !slug}>
            {pending ? "Lager …" : "Lag side"}
          </button>
        </div>
      </form>
    </>
  );
}
