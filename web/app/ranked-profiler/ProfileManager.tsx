"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/components/AuthBits";
import { isValidTag } from "@/lib/rankedTag";
import { track } from "@/lib/analytics";
import { createEntity } from "@/app/rediger/actions";
import { addMini, addProfile, renameProfile, setProfileActive, type ProfileResult } from "./actions";

export type Profile = {
  tag: string;
  name: string;
  active: boolean;
  /** Set for a mini account: the tag of the main profile it belongs to (migration 017). */
  main_tag: string | null;
  created_at: string;
  created_by_name: string | null;
  updated_at: string;
  updated_by_name: string | null;
};

export type WikiPerson = { slug: string; name: string; tag: string };

type Message = { ok: boolean; text: string } | null;

/** Adds a profile (or a mini account) and records it in analytics when it worked. */
async function added(result: Promise<ProfileResult>, kind: "profil" | "mini"): Promise<ProfileResult> {
  const r = await result;
  if (r.ok) track("ranked_profile_added", { kind, via: "ranked-profiler" });
  return r;
}

/** Creates a person wiki page from a profile's name and tag (same as /ny/person/ with those two filled in). */
async function createWiki(p: Profile): Promise<ProfileResult> {
  const r = await createEntity("person", { name: p.name, bsid: p.tag });
  if (!r.ok) return { ok: false, message: r.message };
  track("page_created", { kind: "person", url: r.url, via: "ranked-profiler" });
  return { ok: true, message: `Wiki-side laget for ${p.name}. Fyll inn resten på siden.` };
}

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<Message>(null);
  const run = (fn: () => Promise<ProfileResult>, onOk?: () => void) =>
    start(async () => {
      const r = await fn();
      setMessage({ ok: r.ok, text: r.message });
      if (r.ok) {
        onOk?.();
        router.refresh();
      }
    });
  return { pending, message, setMessage, run };
}

function Status({ message }: { message: Message }) {
  if (!message) return null;
  return <p className={message.ok ? "auth-ok" : "auth-error"}>{message.text}</p>;
}

/** Tag + name form, used for new main profiles and for minis under a main. */
function TagNameForm({
  heading,
  namePlaceholder,
  submitLabel,
  onSubmit,
  onCancel,
  className,
}: {
  heading?: string;
  namePlaceholder: string;
  submitLabel: string;
  onSubmit: (tag: string, name: string) => Promise<ProfileResult>;
  onCancel?: () => void;
  className: string;
}) {
  const { pending, message, run } = useAction();
  const [tag, setTag] = useState("");
  const [name, setName] = useState("");

  return (
    <form
      className={`auth-form ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => onSubmit(tag, name),
          () => {
            setTag("");
            setName("");
          },
        );
      }}
    >
      {heading && <h3>{heading}</h3>}
      <div className="rp-add-row">
        <label>
          Tag
          <input type="text" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="#2GY22JUR" required />
        </label>
        <label>
          Navn
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={namePlaceholder}
            maxLength={60}
            required
          />
        </label>
        <button type="submit" className="auth-button" disabled={pending}>
          {pending ? "Legger til …" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="auth-button secondary" onClick={onCancel}>
            Lukk
          </button>
        )}
      </div>
      <span className="auth-small">Taggen finner du under profilen i Brawl Stars. Bokstaven O leses som null.</span>
      <Status message={message} />
    </form>
  );
}

function ProfileRow({ p, wiki, mini = false }: { p: Profile; wiki?: WikiPerson; mini?: boolean }) {
  const { pending, message, setMessage, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(p.name);
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <>
      <div className="auth-row rp-row">
        <div className="rp-who">
          {mini && <span className="rp-mini-label">Mini</span>}
          {editing ? (
            <form
              className="auth-inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => renameProfile(p.tag, name), () => setEditing(false));
              }}
            >
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                aria-label="Navn"
                autoFocus
              />
              <button type="submit" className="auth-button small" disabled={pending}>
                Lagre
              </button>
              <button
                type="button"
                className="auth-button secondary small"
                onClick={() => {
                  setEditing(false);
                  setName(p.name);
                  setMessage(null);
                }}
              >
                Avbryt
              </button>
            </form>
          ) : (
            <strong>{p.name}</strong>
          )}{" "}
          <code className="rp-tag">{p.tag}</code>
          {wiki && (
            <>
              {" · "}
              <a href={`/personer/${wiki.slug}/`}>wiki</a>
            </>
          )}
          <div className="auth-small">
            {p.created_by_name ? `Lagt til av ${p.created_by_name}` : "Fra den gamle listen"} ·{" "}
            {formatDate(p.created_at)}
          </div>
        </div>
        {!editing && (
          <div className="auth-actions">
            {confirmRemove ? (
              <>
                <button
                  type="button"
                  className="auth-button danger small"
                  disabled={pending}
                  onClick={() => run(() => setProfileActive(p.tag, false))}
                >
                  {pending ? "…" : mini ? "Ja, fjern mini" : "Ja, fjern"}
                </button>
                <button type="button" className="auth-button secondary small" onClick={() => setConfirmRemove(false)}>
                  Avbryt
                </button>
              </>
            ) : (
              <>
                {!mini && !wiki && (
                  <button
                    type="button"
                    className="auth-button secondary small"
                    disabled={pending}
                    title={`Lager /personer/-siden «${p.name}» med taggen ${p.tag}`}
                    onClick={() => run(() => createWiki(p))}
                  >
                    {pending ? "…" : "Lag wiki-side"}
                  </button>
                )}
                <button type="button" className="auth-button secondary small" onClick={() => setEditing(true)}>
                  Endre navn
                </button>
                <button type="button" className="auth-button secondary small" onClick={() => setConfirmRemove(true)}>
                  Fjern
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <Status message={message} />
    </>
  );
}

function MainEntry({ p, minis, wiki }: { p: Profile; minis: Profile[]; wiki: WikiPerson | undefined }) {
  const [adding, setAdding] = useState(false);
  return (
    <li>
      <ProfileRow p={p} wiki={wiki} />
      {minis.length > 0 && (
        <ul className="rp-minis">
          {minis.map((m) => (
            <li key={m.tag}>
              <ProfileRow p={m} mini />
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <TagNameForm
          className="rp-add rp-add-mini"
          heading={`Ny mini-konto for ${p.name}`}
          namePlaceholder={`F.eks. «${p.name}s mini»`}
          submitLabel="Legg til mini"
          onSubmit={(tag, name) => added(addMini(p.tag, tag, name), "mini")}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button type="button" className="rp-add-mini-button" onClick={() => setAdding(true)}>
          + Legg til mini-konto
        </button>
      )}
    </li>
  );
}

function SuggestionRow({ person }: { person: WikiPerson }) {
  const { pending, message, run } = useAction();
  return (
    <li>
      <div className="auth-row">
        <span>
          <a href={`/personer/${person.slug}/`}>{person.name}</a> <code className="rp-tag">{person.tag}</code>
        </span>
        <button
          type="button"
          className="auth-button secondary small"
          disabled={pending}
          onClick={() => run(() => added(addProfile(person.tag, person.name), "profil"))}
        >
          {pending ? "…" : "Legg til"}
        </button>
      </div>
      <Status message={message} />
    </li>
  );
}

function RemovedRow({ p, mainName }: { p: Profile; mainName: string | undefined }) {
  const { pending, message, run } = useAction();
  return (
    <li>
      <div className="auth-row">
        <span>
          {p.name} <code className="rp-tag">{p.tag}</code>
          {mainName && <span className="auth-small"> · mini av {mainName}</span>}
          <span className="auth-small">
            {" "}
            · fjernet{p.updated_by_name ? ` av ${p.updated_by_name}` : ""} {formatDate(p.updated_at)}
          </span>
        </span>
        <button
          type="button"
          className="auth-button secondary small"
          disabled={pending}
          onClick={() => run(() => setProfileActive(p.tag, true))}
        >
          {pending ? "…" : "Legg til igjen"}
        </button>
      </div>
      <Status message={message} />
    </li>
  );
}

export default function ProfileManager({ profiles, wikiPeople }: { profiles: Profile[]; wikiPeople: WikiPerson[] }) {
  const [query, setQuery] = useState("");
  const wikiByTag = new Map(wikiPeople.map((w) => [w.tag, w]));
  const nameByTag = new Map(profiles.map((p) => [p.tag, p.name]));
  const mains = profiles.filter((p) => p.active && !p.main_tag);
  const minisByMain = new Map<string, Profile[]>();
  for (const p of profiles) {
    if (p.active && p.main_tag) minisByMain.set(p.main_tag, [...(minisByMain.get(p.main_tag) ?? []), p]);
  }
  const removed = profiles.filter((p) => !p.active);
  const known = new Set(profiles.map((p) => p.tag));
  const suggestions = wikiPeople.filter((w) => isValidTag(w.tag) && !known.has(w.tag));
  const miniCount = profiles.filter((p) => p.active && p.main_tag).length;

  const q = query.trim().toLowerCase();
  const matches = (p: Profile) => p.name.toLowerCase().includes(q) || p.tag.toLowerCase().includes(q);
  const shown = q ? mains.filter((m) => matches(m) || (minisByMain.get(m.tag) ?? []).some(matches)) : mains;

  return (
    <>
      <TagNameForm
        className="rp-add"
        heading="Legg til profil"
        namePlaceholder="Navnet som vises"
        submitLabel="Legg til"
        onSubmit={(tag, name) => added(addProfile(tag, name), "profil")}
      />

      {suggestions.length > 0 && (
        <>
          <h3>Wiki-sider med tag som ikke spores</h3>
          <ul className="auth-list compact">
            {suggestions.map((w) => (
              <SuggestionRow key={w.tag} person={w} />
            ))}
          </ul>
        </>
      )}

      <div className="rp-list-head">
        <h3>
          Spores nå ({mains.length}
          {miniCount > 0 && ` + ${miniCount} mini`})
        </h3>
        <input
          type="search"
          className="rp-search"
          placeholder="Søk navn eller tag"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Søk i profiler"
        />
      </div>
      <ul className="auth-list">
        {shown.map((p) => (
          <MainEntry key={p.tag} p={p} minis={minisByMain.get(p.tag) ?? []} wiki={wikiByTag.get(p.tag)} />
        ))}
        {shown.length === 0 && <li className="auth-small">Ingen treff.</li>}
      </ul>

      {removed.length > 0 && (
        <details className="rp-removed">
          <summary>Fjernet ({removed.length})</summary>
          <ul className="auth-list compact">
            {removed.map((p) => (
              <RemovedRow key={p.tag} p={p} mainName={p.main_tag ? nameByTag.get(p.main_tag) : undefined} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
