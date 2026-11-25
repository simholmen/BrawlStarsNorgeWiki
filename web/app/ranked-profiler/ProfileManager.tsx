"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/components/AuthBits";
import { isValidTag } from "@/lib/rankedTag";
import { addProfile, renameProfile, setProfileActive, type ProfileResult } from "./actions";

export type Profile = {
  tag: string;
  name: string;
  active: boolean;
  created_at: string;
  created_by_name: string | null;
  updated_at: string;
  updated_by_name: string | null;
};

export type WikiPerson = { slug: string; name: string; tag: string };

type Message = { ok: boolean; text: string } | null;

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

function AddForm() {
  const { pending, message, run } = useAction();
  const [tag, setTag] = useState("");
  const [name, setName] = useState("");

  return (
    <form
      className="auth-form rp-add"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => addProfile(tag, name),
          () => {
            setTag("");
            setName("");
          },
        );
      }}
    >
      <h3>Legg til profil</h3>
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
            placeholder="Navnet som vises"
            maxLength={60}
            required
          />
        </label>
        <button type="submit" className="auth-button" disabled={pending}>
          {pending ? "Legger til …" : "Legg til"}
        </button>
      </div>
      <span className="auth-small">
        Taggen finner du under profilen i Brawl Stars. Bokstaven O leses som null.
      </span>
      <Status message={message} />
    </form>
  );
}

function ProfileRow({ p, wiki }: { p: Profile; wiki: WikiPerson | undefined }) {
  const { pending, message, setMessage, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(p.name);
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <li>
      <div className="auth-row rp-row">
        <div className="rp-who">
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
                  {pending ? "…" : "Ja, fjern"}
                </button>
                <button type="button" className="auth-button secondary small" onClick={() => setConfirmRemove(false)}>
                  Avbryt
                </button>
              </>
            ) : (
              <>
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
          onClick={() => run(() => addProfile(person.tag, person.name))}
        >
          {pending ? "…" : "Legg til"}
        </button>
      </div>
      <Status message={message} />
    </li>
  );
}

function RemovedRow({ p }: { p: Profile }) {
  const { pending, message, run } = useAction();
  return (
    <li>
      <div className="auth-row">
        <span>
          {p.name} <code className="rp-tag">{p.tag}</code>
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
  const active = profiles.filter((p) => p.active);
  const removed = profiles.filter((p) => !p.active);
  const known = new Set(profiles.map((p) => p.tag));
  const suggestions = wikiPeople.filter((w) => isValidTag(w.tag) && !known.has(w.tag));

  const q = query.trim().toLowerCase();
  const shown = q ? active.filter((p) => p.name.toLowerCase().includes(q) || p.tag.toLowerCase().includes(q)) : active;

  return (
    <>
      <AddForm />

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
        <h3>Spores nå ({active.length})</h3>
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
          <ProfileRow key={p.tag} p={p} wiki={wikiByTag.get(p.tag)} />
        ))}
        {shown.length === 0 && <li className="auth-small">Ingen treff.</li>}
      </ul>

      {removed.length > 0 && (
        <details className="rp-removed">
          <summary>Fjernet ({removed.length})</summary>
          <ul className="auth-list compact">
            {removed.map((p) => (
              <RemovedRow key={p.tag} p={p} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
