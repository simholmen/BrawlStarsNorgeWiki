"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/browser";
import { BODY_MAX, FIELD_LABELS, IMAGE_EXTS, PROFILE_YEARS, TEXT_FIELDS, type EntityKind } from "@/lib/fields";
import type { Fact } from "@/lib/types";
import { saveEntity } from "@/app/rediger/actions";
import LinkTextField from "./LinkTextField";
import MarkdownEditor from "./MarkdownEditor";
import { FactsEditor, StringListEditor } from "./ListEditors";
import { useWikiEntities } from "./useWikiEntities";

// Edit mode for one person/club page. Loaded lazily (only editors who click "Rediger" download
// this). Loads the raw row, keeps a draft, and on save sends only the fields that changed plus
// the row's updated_at, so a concurrent save by someone else is detected instead of overwritten.

type Row = Record<string, unknown> & { updated_at: string };

const TABLE = { person: "people", club: "clubs" } as const;

/** Values as the form edits them: text fields as strings (null -> ""). */
function toDraft(kind: EntityKind, row: Row): Row {
  const draft: Row = { ...row };
  for (const f of TEXT_FIELDS[kind]) draft[f.key] = (row[f.key] as string | null) ?? "";
  return draft;
}

function editableKeys(kind: EntityKind): string[] {
  const keys = TEXT_FIELDS[kind].map((f) => f.key);
  keys.push("facts", "body_md", "image_ext");
  keys.push(kind === "person" ? "hidden_profile_years" : "underklubber");
  return keys;
}

export default function PageEditor({ kind, slug, onClose }: { kind: EntityKind; slug: string; onClose: () => void }) {
  const router = useRouter();
  const entities = useWikiEntities();
  const [original, setOriginal] = useState<Row | null>(null);
  const [draft, setDraft] = useState<Row | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string; conflict?: boolean } | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    getBrowserClient()
      .from(TABLE[kind])
      .select("*")
      .eq("slug", slug)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) return setLoadError("Kunne ikke laste siden for redigering.");
        const d = toDraft(kind, data as Row);
        setOriginal(d);
        setDraft(d);
      });
  }, [kind, slug]);

  const changed = useMemo(() => {
    if (!original || !draft) return [];
    return editableKeys(kind).filter((k) => JSON.stringify(original[k]) !== JSON.stringify(draft[k]));
  }, [kind, original, draft]);
  const dirty = changed.length > 0;

  // Warn before leaving the page with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (loadError) return <p className="auth-error">{loadError}</p>;
  if (!draft || !original) return <p className="auth-small">Laster redigering …</p>;

  const set = (key: string, value: unknown) => {
    setDraft({ ...draft, [key]: value });
    setMessage(null);
  };

  async function save() {
    if (!draft || !original) return;
    setSaving(true);
    setMessage(null);
    const changes = Object.fromEntries(changed.map((k) => [k, draft[k]]));
    const result = await saveEntity(kind, slug, original.updated_at, changes);
    setSaving(false);
    if (!result.ok) {
      const who = result.conflict?.by ? ` (sist lagret av ${result.conflict.by})` : "";
      setMessage({ ok: false, text: result.message + who, conflict: Boolean(result.conflict) });
      return;
    }
    // Show the fresh server render of the page and leave edit mode.
    setOriginal(draft);
    onClose();
    router.refresh();
  }

  function cancel() {
    if (dirty && !confirmDiscard) return setConfirmDiscard(true);
    onClose();
  }

  const hidden = (draft.hidden_profile_years as number[] | undefined) ?? [];

  return (
    <div className="page-editor">
      <h2 className="strekstopp">Redigerer: {String(original.name)}</h2>

      <fieldset className="editor-section">
        <legend>Infoboks</legend>
        <table className="editor-fields">
          <tbody>
            {TEXT_FIELDS[kind].map((f) => (
              <tr key={f.key}>
                <th>
                  <label htmlFor={`f-${f.key}`}>{f.label}</label>
                </th>
                <td>
                  {f.key === "name" || f.key === "bsid" ? (
                    <input
                      id={`f-${f.key}`}
                      type="text"
                      value={draft[f.key] as string}
                      maxLength={f.max}
                      required={f.required}
                      onChange={(e) => set(f.key, e.target.value)}
                    />
                  ) : (
                    <LinkTextField
                      id={`f-${f.key}`}
                      value={draft[f.key] as string}
                      onChange={(v) => set(f.key, v)}
                      entities={entities}
                      maxLength={f.max}
                    />
                  )}
                  {f.hint && <div className="auth-small">{f.hint}</div>}
                </td>
              </tr>
            ))}
            <tr>
              <th>
                <label htmlFor="f-image_ext">Profilbilde-format</label>
              </th>
              <td>
                <select id="f-image_ext" value={draft.image_ext as string} onChange={(e) => set("image_ext", e.target.value)}>
                  {IMAGE_EXTS.map((ext) => (
                    <option key={ext} value={ext}>
                      .{ext}
                    </option>
                  ))}
                </select>
                <div className="auth-small">
                  Bildet hentes fra <code>/images/…/{String(original.image_key)}.{String(draft.image_ext)}</code>
                </div>
              </td>
            </tr>
            {kind === "person" && (
              <tr>
                <th>Profilbilder</th>
                <td>
                  {PROFILE_YEARS.map((year) => (
                    <label key={year} className="inline-check">
                      <input
                        type="checkbox"
                        checked={!hidden.includes(year)}
                        onChange={(e) =>
                          set(
                            "hidden_profile_years",
                            e.target.checked ? hidden.filter((y) => y !== year) : [...hidden, year].sort(),
                          )
                        }
                      />{" "}
                      {year}
                    </label>
                  ))}
                  <div className="auth-small">Bilder som ikke finnes vises ikke uansett.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <h4>Fakta (ekstra rader i infoboksen)</h4>
        <FactsEditor facts={draft.facts as Fact[]} onChange={(f) => set("facts", f)} entities={entities} />

        {kind === "club" && (
          <>
            <h4>Underklubber</h4>
            <StringListEditor
              items={draft.underklubber as string[]}
              onChange={(v) => set("underklubber", v)}
              placeholder="Underklubb"
            />
          </>
        )}
      </fieldset>

      <fieldset className="editor-section">
        <legend>Tekst</legend>
        <MarkdownEditor
          value={draft.body_md as string}
          onChange={(v) => set("body_md", v)}
          entities={entities}
          maxLength={BODY_MAX}
        />
      </fieldset>

      <div className="editor-bar">
        <span className="editor-bar-status">
          {message ? (
            <span className={message.ok ? "auth-ok" : "auth-error"}>{message.text}</span>
          ) : dirty ? (
            <>Endret: {changed.map((k) => FIELD_LABELS[k] ?? k).join(", ")}</>
          ) : (
            <span className="auth-small">Ingen endringer ennå</span>
          )}
        </span>
        {message?.conflict && (
          <button type="button" className="auth-button secondary" onClick={() => window.location.reload()}>
            Last inn på nytt (forkaster dine endringer)
          </button>
        )}
        <a className="editor-bar-link" href={`/historikk/${kind === "person" ? "person" : "klubb"}/${slug}/`}>
          Historikk
        </a>
        <button type="button" className="auth-button secondary" onClick={cancel} disabled={saving}>
          {confirmDiscard ? "Ja, forkast endringene" : "Avbryt"}
        </button>
        <button type="button" className="auth-button" onClick={save} disabled={!dirty || saving}>
          {saving ? "Lagrer …" : "Lagre"}
        </button>
      </div>
    </div>
  );
}
