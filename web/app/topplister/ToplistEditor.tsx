"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { isEditor, useViewer } from "@/lib/useViewer";
import { isValidTag, normalizeTag } from "@/lib/rankedTag";
import { formatDate } from "@/components/AuthBits";
import { setEditActions } from "@/components/editor/EditContext";
import type { ExtraPlayer } from "@/lib/toplistsBuild";
import SortToggle, { sortByOrder, type SortOrder } from "@/components/SortToggle";
import { addPlayer, setToplistPlayerActive, type ToplistResult } from "./actions";

// Editors only: add players, like the Ranked-profiler form, with "Følg på ranked-siden" and
// "Lag wiki-side" checkboxes (either puts them on the toplists automatically; with neither they're
// added to the toplists only), and promote or remove toplist-only players. Opened with "+ Legg til spiller" in the page bar (like
// "Rediger" on person pages); the box sits at the top of the page. Everyone else sees nothing.

type Message = { ok: boolean; text: string } | null;

const noop = () => () => {};

/** False while hydrating, true after: the server never knows who's logged in. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<Message>(null);
  const run = (fn: () => Promise<ToplistResult>, onOk?: () => void) =>
    start(async () => {
      const r = await fn();
      setMessage({ ok: r.ok, text: r.message });
      if (r.ok) {
        onOk?.();
        router.refresh();
      }
    });
  return { pending, message, run };
}

function Status({ message }: { message: Message }) {
  if (!message) return null;
  return <p className={message.ok ? "auth-ok" : "auth-error"}>{message.text}</p>;
}

function PlayerRow({ p }: { p: ExtraPlayer }) {
  const { pending, message, run } = useAction();
  return (
    <li>
      <div className="auth-row">
        <span>
          <strong>{p.name}</strong> <code className="rp-tag">{p.tag}</code>
          <span className="auth-small">
            {" "}
            · lagt til{p.created_by_name ? ` av ${p.created_by_name}` : ""} {formatDate(p.created_at)}
          </span>
        </span>
        <div className="auth-actions">
          {p.active && (
            <>
              <button
                type="button"
                className="auth-button secondary small"
                disabled={pending}
                onClick={() => run(() => addPlayer(p.tag, p.name, { ranked: true, wiki: false }))}
              >
                Følg på ranked
              </button>
              <button
                type="button"
                className="auth-button secondary small"
                disabled={pending}
                onClick={() => run(() => addPlayer(p.tag, p.name, { ranked: false, wiki: true }))}
              >
                Lag wiki-side
              </button>
            </>
          )}
          <button
            type="button"
            className="auth-button secondary small"
            disabled={pending}
            onClick={() => run(() => setToplistPlayerActive(p.tag, !p.active))}
          >
            {pending ? "…" : p.active ? "Fjern" : "Legg til igjen"}
          </button>
        </div>
      </div>
      <Status message={message} />
    </li>
  );
}

export default function ToplistEditor({
  extras,
  coveredTags,
}: {
  extras: ExtraPlayer[];
  coveredTags: Record<string, string>;
}) {
  const viewer = useViewer();
  const hydrated = useHydrated();
  const { pending, message, run } = useAction();
  const [tag, setTag] = useState("");
  const [name, setName] = useState("");
  const [ranked, setRanked] = useState(false);
  const [wiki, setWiki] = useState(false);
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState<SortOrder>("name");
  const [query, setQuery] = useState("");
  const canEdit = hydrated && isEditor(viewer);

  // The page bar button that opens / closes the box.
  useEffect(() => {
    if (!canEdit) return;
    setEditActions({
      label: open ? "Lukk" : "+ Legg til spiller",
      active: open,
      startEdit: () => setOpen((o) => !o),
    });
    return () => setEditActions(null);
  }, [canEdit, open]);

  // Render nothing until hydrated: the viewer may already be known in the browser (another
  // component looked it up first), and drawing the box then would not match the server HTML.
  if (!canEdit || !open) return null;

  const normalized = normalizeTag(tag);
  const covered = isValidTag(normalized) ? coveredTags[normalized] : undefined;
  // Search by name or tag ("2gy22" finds #2GY22JUR too), like on Ranked-profiler.
  const q = query.trim().toLowerCase().replace(/^#/, "");
  const matches = (p: ExtraPlayer) => !q || p.name.toLowerCase().includes(q) || p.tag.toLowerCase().includes(q);
  const activeAll = extras.filter((e) => e.active);
  const active = sortByOrder(activeAll.filter(matches), order);
  const removedAll = extras.filter((e) => !e.active);
  const removed = removedAll.filter(matches);

  return (
    <div className="auth-panel wide toplist-editor">
      <div className="toplist-editor-head">
        <h3>Legg til spillere i topplistene</h3>
        <button type="button" className="auth-button secondary small" onClick={() => setOpen(false)}>
          Lukk
        </button>
      </div>
      <p className="auth-small">
        Alle med wiki-side (med tag) og alle som følges på ranked-siden er med automatisk. Kryss av for å legge
        spilleren til der også, eller la begge stå tomme for å bare legge dem til i topplistene.
      </p>
      <form
        className="auth-form rp-add"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => addPlayer(tag, name, { ranked, wiki }),
            () => {
              setTag("");
              setName("");
              setRanked(false);
              setWiki(false);
            },
          );
        }}
      >
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
          <button type="submit" className="auth-button" disabled={pending || (Boolean(covered) && !ranked && !wiki)}>
            {pending ? "Legger til …" : "Legg til"}
          </button>
        </div>
        <div className="toplist-add-options">
          <label>
            <input type="checkbox" checked={ranked} onChange={(e) => setRanked(e.target.checked)} />
            Følg på ranked-siden
          </label>
          <label>
            <input type="checkbox" checked={wiki} onChange={(e) => setWiki(e.target.checked)} />
            Lag wiki-side
          </label>
        </div>
        {covered ? (
          <span className="auth-small">{normalized} er allerede med, fra {covered}.</span>
        ) : (
          <span className="auth-small">Taggen finner du under profilen i Brawl Stars. Bokstaven O leses som null.</span>
        )}
        <Status message={message} />
      </form>

      <div className="rp-list-head">
        <h3>
          Bare i topplistene ({q ? `${active.length} av ${activeAll.length}` : activeAll.length})
        </h3>
        {extras.length > 1 && (
          <div className="rp-list-tools">
            <SortToggle value={order} onChange={setOrder} />
            <input
              type="search"
              className="rp-search"
              placeholder="Søk navn eller tag"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Søk blant spillerne"
            />
          </div>
        )}
      </div>
      {active.length === 0 ? (
        <p className="auth-small">{q ? "Ingen treff." : "Ingen ennå."}</p>
      ) : (
        <ul className="auth-list compact">
          {active.map((p) => (
            <PlayerRow key={p.tag} p={p} />
          ))}
        </ul>
      )}
      {removed.length > 0 && (
        <details className="rp-removed" open={q ? true : undefined}>
          <summary>Fjernet ({q ? `${removed.length} av ${removedAll.length}` : removed.length})</summary>
          <ul className="auth-list compact">
            {removed.map((p) => (
              <PlayerRow key={p.tag} p={p} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
