"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/browser";
import { BODY_MAX, FIELD_LABELS, IMAGE_EXTS, PROFILE_YEARS, TEXT_FIELDS, type EntityKind } from "@/lib/fields";
import type { Fact } from "@/lib/types";
import { saveEntity } from "@/app/rediger/actions";
import { track } from "@/lib/analytics";
import LinkTextField from "./LinkTextField";
import MarkdownEditor from "./MarkdownEditor";
import { FactsEditor, StringListEditor } from "./ListEditors";
import ImageSlot, { UploadButton } from "./ImageSlot";
import {
  legacyPortrait,
  profileImages,
  PROFILE_URLS_MAX,
  PROFILE_YEAR_MIN,
  type ProfileUrls,
} from "@/lib/profileImages";
import { useWikiEntities } from "./useWikiEntities";
import DeletePanel from "./DeletePanel";
import { useViewer } from "@/lib/useViewer";

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
  keys.push("facts", "body_md", "image_ext", "portrait_url", "profile_urls");
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
  const [deleting, setDeleting] = useState(false);
  const viewer = useViewer();
  const isAdmin = viewer.status === "in" && viewer.role === "admin";

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

  const set = (key: string, value: unknown) => setMany({ [key]: value });
  function setMany(values: Record<string, unknown>) {
    setDraft((d) => (d ? { ...d, ...values } : d));
    setMessage(null);
  }

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
    track("page_saved", { kind, slug, fields: changed });
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
  const imageKey = String(original.image_key);
  const portraitUrl = (draft.portrait_url as string | null) ?? null;
  const profileUrls = (draft.profile_urls as ProfileUrls | undefined) ?? {};
  const profiles = profileImages(kind, imageKey, profileUrls);
  const thisYear = new Date().getFullYear();
  const newYears: number[] = [];
  for (let y = thisYear + 1; y >= PROFILE_YEAR_MIN; y--) {
    if (!profiles.some((p) => p.year === y)) newYears.push(y);
  }
  const yearToAdd = newYears.includes(thisYear) ? thisYear : newYears[0];

  function setProfileUrl(year: number, url: string | null) {
    const next = { ...profileUrls };
    if (url) next[String(year)] = url;
    else delete next[String(year)];
    // An uploaded picture for a hidden year is meant to be seen.
    setMany(url && hidden.includes(year)
      ? { profile_urls: next, hidden_profile_years: hidden.filter((y) => y !== year) }
      : { profile_urls: next });
  }

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
        <legend>Bilder</legend>

        <h4>Profilbilde (infoboksen)</h4>
        <ImageSlot
          label="Profilbilde"
          src={portraitUrl ?? legacyPortrait(kind, imageKey, String(draft.image_ext))}
          uploaded={Boolean(portraitUrl)}
          onUpload={(url) => set("portrait_url", url)}
          onRemove={() => set("portrait_url", null)}
          hint={
            portraitUrl ? (
              "«Fjern opplastet» går tilbake til bildet i bildemappen, hvis det finnes."
            ) : (
              <>
                Hentes fra <code>{legacyPortrait(kind, imageKey, String(draft.image_ext))}</code>
              </>
            )
          }
        >
          {!portraitUrl && (
            <label className="inline-check">
              Format{" "}
              <select id="f-image_ext" value={draft.image_ext as string} onChange={(e) => set("image_ext", e.target.value)}>
                {IMAGE_EXTS.map((ext) => (
                  <option key={ext} value={ext}>
                    .{ext}
                  </option>
                ))}
              </select>
            </label>
          )}
        </ImageSlot>

        <h4>Brawl Stars-profilbilder</h4>
        {profiles.map((p) => (
          <ImageSlot
            key={p.year}
            label={p.uploaded ? String(p.year) : `${p.year} (${p.when})`}
            src={p.src}
            uploaded={p.uploaded}
            onUpload={(url) => setProfileUrl(p.year, url)}
            onRemove={() => setProfileUrl(p.year, null)}
          >
            {kind === "person" && (PROFILE_YEARS as readonly number[]).includes(p.year) && (
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={!hidden.includes(p.year)}
                  onChange={(e) =>
                    set(
                      "hidden_profile_years",
                      e.target.checked ? hidden.filter((y) => y !== p.year) : [...hidden, p.year].sort(),
                    )
                  }
                />{" "}
                Vis på siden
              </label>
            )}
          </ImageSlot>
        ))}
        {yearToAdd !== undefined && Object.keys(profileUrls).length < PROFILE_URLS_MAX && (
          <AddProfileYear years={newYears} initial={yearToAdd} onAdd={setProfileUrl} />
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

      {deleting && (
        <DeletePanel kind={kind} slug={slug} name={String(original.name)} onCancel={() => setDeleting(false)} />
      )}

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
        {isAdmin && !deleting && (
          <button type="button" className="auth-button danger small" onClick={() => setDeleting(true)} disabled={saving}>
            Slett side…
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

/** Upload a profile screenshot for a year that has none yet. */
function AddProfileYear({
  years,
  initial,
  onAdd,
}: {
  years: number[];
  initial: number;
  onAdd: (year: number, url: string) => void;
}) {
  const [picked, setPicked] = useState(initial);
  // After an upload the picked year leaves the list; fall back to the suggested one.
  const year = years.includes(picked) ? picked : initial;
  return (
    <div className="image-slot-add">
      Nytt profilbilde for{" "}
      <select value={year} onChange={(e) => setPicked(Number(e.target.value))} aria-label="År">
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>{" "}
      <UploadButton label="Last opp" onUploaded={(url) => onAdd(year, url)} />
    </div>
  );
}
