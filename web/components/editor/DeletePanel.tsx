"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EntityKind } from "@/lib/fields";
import { deleteEntity, findBacklinks, type Backlink } from "@/app/rediger/actions";

// Admin-only "delete page" confirmation, opened from the editor. Shows which pages link here
// (those links stop working) before the final click. The page is snapshotted into the history
// by the database, so an admin can restore it from /historikk/.

export default function DeletePanel({
  kind,
  slug,
  name,
  onCancel,
}: {
  kind: EntityKind;
  slug: string;
  name: string;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [backlinks, setBacklinks] = useState<Backlink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    findBacklinks(kind, slug).then((b) => alive && setBacklinks(b));
    return () => {
      alive = false;
    };
  }, [kind, slug]);

  function confirm() {
    setError(null);
    start(async () => {
      const r = await deleteEntity(kind, slug);
      if (!r.ok) return setError(r.message);
      router.push("/historikk/");
      router.refresh();
    });
  }

  return (
    <div className="delete-panel" role="alertdialog" aria-labelledby="delete-title">
      <h4 id="delete-title">Slette «{name}»?</h4>
      <p>
        Siden forsvinner fra wikien og sideoversikten. Den lagres i historikken, så en administrator kan
        gjenopprette den senere med samme adresse og innhold. Bilder i <code>docs/images</code> berøres ikke.
      </p>
      {backlinks === null ? (
        <p className="auth-small">Sjekker hvilke sider som lenker hit …</p>
      ) : backlinks.length === 0 ? (
        <p className="auth-small">Ingen andre sider lenker hit.</p>
      ) : (
        <>
          <p>
            <strong>{backlinks.length} {backlinks.length === 1 ? "side lenker" : "sider lenker"} hit</strong>; de
            lenkene slutter å virke:
          </p>
          <ul>
            {backlinks.map((b) => (
              <li key={`${b.kind}:${b.slug}`}>
                <a href={`${b.kind === "person" ? "/personer/" : "/klubber/"}${b.slug}/`} target="_blank" rel="noreferrer">
                  {b.name}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && <p className="auth-error">{error}</p>}
      <div className="auth-actions">
        <button type="button" className="auth-button danger-solid" onClick={confirm} disabled={pending || backlinks === null}>
          {pending ? "Sletter …" : `Ja, slett «${name}»`}
        </button>
        <button type="button" className="auth-button secondary" onClick={onCancel} disabled={pending}>
          Avbryt
        </button>
      </div>
    </div>
  );
}
