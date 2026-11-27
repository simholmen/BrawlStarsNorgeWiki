"use client";

import { createContext, useCallback, useContext, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TagInput from "@/components/TagInput";
import SortToggle from "@/components/SortToggle";
import { formatDate } from "@/components/AuthBits";
import { track } from "@/lib/analytics";
import { isValidTag, normalizeTag } from "@/lib/rankedTag";
import {
  matchesQuery,
  sortByOrder,
  whereIs,
  type DirectoryMini,
  type DirectoryPlayer,
  type PlayerDirectory,
  type PlayerSource,
  type RemovedPlayer,
  type SortOrder,
} from "@/lib/playerDirectory";
import { loadPlayers } from "@/app/spillere/actions";
import { Icon, type IconName } from "./icons";
import {
  addPlayer,
  renameToplistPlayer,
  setToplistPlayerActive,
  undoFollowRanked,
  type RankedUndo,
} from "@/app/topplister/actions";
import { addMini, renameProfile, setProfileActive } from "@/app/ranked-profiler/actions";

// The one "Legg til spiller" box, on /spillere/ and opened from the page bar on Topplister.
// Add a player with a tag and a name, ticking "Følg på ranked-siden" and/or "Lag wiki-side" (with
// neither, they go on the toplists only). Below it every player the site knows, filtered to
// Alle / Wiki / Ranked / Topplister, sorted by name or newest, searchable, with the actions for
// each place they're on.

export type PlayerView = "all" | PlayerSource;

export type PlayerManagerProps = {
  /** Server-rendered list (/spillere/); without it the box loads the list itself. */
  initial?: PlayerDirectory;
  /** Which boxes start ticked and which filter is on ("Ny side" ticks wiki). */
  defaults?: { ranked?: boolean; wiki?: boolean; view?: PlayerView };
  /** For analytics: which page the box is on. */
  via: string;
  /** Shows a "Lukk" button. */
  onClose?: () => void;
};

type Result = { ok: boolean; message: string; url?: string; undo?: RankedUndo };

/** Lets any write that put someone on the ranked roster offer "Angre" in the box's undo bar. */
const OfferUndo = createContext<(undo: RankedUndo) => void>(() => {});
type Message = { ok: boolean; text: string; url?: string } | null;

const SOURCE_LABEL: Record<PlayerSource, string> = { wiki: "Wiki", ranked: "Ranked", topplister: "Topplister" };

function Status({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p className={message.ok ? "auth-ok" : "auth-error"}>
      {message.text}
      {message.url && (
        <>
          {" "}
          <a href={`${message.url}?rediger=1`}>Åpne siden og fyll inn resten</a>
        </>
      )}
    </p>
  );
}

/** Runs one write; on success reloads the list (and the page around the box, e.g. the toplists). */
function useAction(reload: () => void) {
  const router = useRouter();
  const offerUndo = useContext(OfferUndo);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<Message>(null);
  const run = (fn: () => Promise<Result>, onOk?: (r: Result) => void) =>
    start(async () => {
      const r = await fn();
      setMessage({ ok: r.ok, text: r.message, url: r.url });
      if (r.ok) {
        onOk?.(r);
        if (r.undo) offerUndo(r.undo);
        reload();
        router.refresh();
      }
    });
  return { pending, message, setMessage, run };
}

function NameEditor({
  initial,
  label,
  pending,
  onSave,
  onCancel,
}: {
  initial: string;
  label: string;
  pending: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  return (
    <form
      className="auth-inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim() === initial) return onCancel();
        onSave(name);
      }}
    >
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        required
        autoFocus
        aria-label={label}
      />
      <button type="submit" className="auth-button small" disabled={pending}>
        {pending ? "Lagrer …" : "Lagre"}
      </button>
      <button type="button" className="auth-button secondary small" disabled={pending} onClick={onCancel}>
        Avbryt
      </button>
    </form>
  );
}

function Sources({ sources }: { sources: PlayerSource[] }) {
  return (
    <span className="player-sources">
      {sources.map((s) => (
        <span key={s} className={`player-source player-source-${s}`}>
          {SOURCE_LABEL[s]}
        </span>
      ))}
    </span>
  );
}

/** A small icon-only button; the label shows as a tooltip and is read out by screen readers. */
function IconButton({
  icon,
  label,
  onClick,
  disabled,
  tone,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      className={`pm-icon${tone ? ` pm-icon-${tone}` : ""}`}
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  );
}

/** The remove icon with a second "Fjern?" step, so one stray tap doesn't remove anyone. */
function RemoveButton({ label, pending, onConfirm }: { label: string; pending: boolean; onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return <IconButton icon="remove" label={label} tone="danger" disabled={pending} onClick={() => setAsking(true)} />;
  }
  return (
    <span className="pm-confirm">
      <button type="button" className="pm-confirm-yes" disabled={pending} onClick={onConfirm} title={label}>
        {pending ? "…" : "Fjern?"}
      </button>
      <button type="button" className="pm-confirm-no" onClick={() => setAsking(false)}>
        Avbryt
      </button>
    </span>
  );
}

function MiniRow({ m, reload }: { m: DirectoryMini; reload: () => void }) {
  const { pending, message, run } = useAction(reload);
  const [editing, setEditing] = useState(false);
  return (
    <li>
      <div className="pm-row">
        <div className="pm-who">
          <span className="rp-mini-label">Mini</span>
          {editing ? (
            <NameEditor
              initial={m.name}
              label={`Nytt navn for ${m.tag}`}
              pending={pending}
              onSave={(name) => run(() => renameProfile(m.tag, name), () => setEditing(false))}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <span className="pm-name">{m.name}</span>
          )}
          <code className="pm-tag">{m.tag}</code>
        </div>
        {!editing && (
          <div className="pm-actions">
            <IconButton icon="rename" label="Endre navn" onClick={() => setEditing(true)} />
            <RemoveButton
              label="Fjern mini-kontoen"
              pending={pending}
              onConfirm={() => run(() => setProfileActive(m.tag, false))}
            />
          </div>
        )}
      </div>
      <Status message={message} />
    </li>
  );
}

function MiniForm({ main, reload, via, onClose }: { main: DirectoryPlayer; reload: () => void; via: string; onClose: () => void }) {
  const { pending, message, run } = useAction(reload);
  const [tag, setTag] = useState("");
  const [name, setName] = useState("");
  return (
    <form
      className="auth-form rp-add rp-add-mini"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => addMini(main.tag, tag, name),
          () => {
            track("ranked_profile_added", { kind: "mini", via });
            setTag("");
            setName("");
          },
        );
      }}
    >
      <h3>Ny mini-konto for {main.name}</h3>
      <div className="rp-add-row">
        <label>
          Tag
          <TagInput value={tag} onChange={setTag} required />
        </label>
        <label>
          Navn
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`F.eks. «${main.name}s mini»`}
            maxLength={60}
            required
          />
        </label>
        <button type="submit" className="auth-button" disabled={pending}>
          {pending ? "Legger til …" : "Legg til mini"}
        </button>
        <button type="button" className="auth-button secondary" onClick={onClose}>
          Lukk
        </button>
      </div>
      <Status message={message} />
    </form>
  );
}

function PlayerRow({
  p,
  reload,
  via,
  showDate,
}: {
  p: DirectoryPlayer;
  reload: () => void;
  via: string;
  showDate: boolean;
}) {
  const { pending, message, run } = useAction(reload);
  const [editing, setEditing] = useState(false);
  const [addingMini, setAddingMini] = useState(false);
  // "Endre navn" changes the ranked profile's name, else the toplist-only one; a wiki page's
  // name is changed on the page itself.
  const ownName = p.ranked?.name ?? p.extra?.name ?? null;
  const otherNames = [
    p.ranked && p.ranked.name !== p.name && `ranked: ${p.ranked.name}`,
    p.extra && p.extra.name !== p.name && `topplister: ${p.extra.name}`,
  ].filter(Boolean);
  const added = `Lagt til ${p.created_by_name ? `av ${p.created_by_name} ` : ""}${formatDate(p.created_at)}`;
  // Who added them and when: always as a tooltip, on its own line only when sorting by newest.
  const sub = [...otherNames, showDate && added].filter(Boolean);

  return (
    <li>
      <div className="pm-row">
        <div className="pm-who" title={added}>
          {editing && ownName !== null ? (
            <NameEditor
              initial={ownName}
              label={`Nytt navn for ${p.tag}`}
              pending={pending}
              onSave={(name) =>
                run(
                  () => (p.ranked ? renameProfile(p.tag, name) : renameToplistPlayer(p.tag, name)),
                  () => setEditing(false),
                )
              }
              onCancel={() => setEditing(false)}
            />
          ) : p.wiki ? (
            <a className="pm-name" href={`/personer/${p.wiki.slug}/`}>
              {p.name}
            </a>
          ) : (
            <span className="pm-name">{p.name}</span>
          )}
          <code className="pm-tag">{p.tag}</code>
          <Sources sources={p.sources} />
          {sub.length > 0 && <div className="pm-sub">{sub.join(" · ")}</div>}
        </div>
        {!editing && (
          <div className="pm-actions">
            {ownName !== null && (
              <IconButton icon="rename" label="Endre navn" disabled={pending} onClick={() => setEditing(true)} />
            )}
            {!p.ranked && (
              <IconButton
                icon="ranked"
                label="Følg på ranked-siden"
                disabled={pending}
                onClick={() =>
                  run(
                    () => addPlayer(p.tag, p.name, { ranked: true, wiki: false }),
                    () => track("ranked_profile_added", { kind: "profil", via }),
                  )
                }
              />
            )}
            {!p.wiki && (
              <IconButton
                icon="wiki"
                label={`Lag wiki-side («${p.name}»)`}
                disabled={pending}
                onClick={() =>
                  run(
                    () => addPlayer(p.tag, p.name, { ranked: false, wiki: true }),
                    (r) => r.url && track("page_created", { kind: "person", url: r.url, via }),
                  )
                }
              />
            )}
            {p.ranked && (
              <IconButton icon="mini" label="Legg til mini-konto" disabled={pending} onClick={() => setAddingMini(true)} />
            )}
            {p.ranked && (
              <RemoveButton
                label="Fjern fra ranked-siden"
                pending={pending}
                onConfirm={() => run(() => setProfileActive(p.tag, false))}
              />
            )}
            {p.extra && (
              <RemoveButton
                label="Fjern fra topplistene"
                pending={pending}
                onConfirm={() => run(() => setToplistPlayerActive(p.tag, false))}
              />
            )}
          </div>
        )}
      </div>
      <Status message={message} />
      {p.ranked && p.minis.length > 0 && (
        <ul className="pm-minis">
          {p.minis.map((m) => (
            <MiniRow key={m.tag} m={m} reload={reload} />
          ))}
        </ul>
      )}
      {p.ranked && addingMini && <MiniForm main={p} reload={reload} via={via} onClose={() => setAddingMini(false)} />}
    </li>
  );
}

function RemovedRow({ r, reload }: { r: RemovedPlayer; reload: () => void }) {
  const { pending, message, run } = useAction(reload);
  const removed = `Fjernet ${r.removed_by_name ? `av ${r.removed_by_name} ` : ""}${formatDate(r.removed_at)}`;
  return (
    <li>
      <div className="pm-row">
        <div className="pm-who" title={removed}>
          <span className="pm-name">{r.name}</span>
          <code className="pm-tag">{r.tag}</code>
          <Sources sources={[r.source]} />
          {r.miniOf && <div className="pm-sub">mini av {r.miniOf}</div>}
        </div>
        <div className="pm-actions">
          <IconButton
            icon="restore"
            label="Legg til igjen"
            disabled={pending}
            onClick={() =>
              run(() => (r.source === "ranked" ? setProfileActive(r.tag, true) : setToplistPlayerActive(r.tag, true)))
            }
          />
        </div>
      </div>
      <Status message={message} />
    </li>
  );
}

/**
 * "<name> følges nå på ranked-siden. Angre" at the bottom of the screen after "Følg på ranked"
 * (the row may leave the list, e.g. under "Bare topplister"). Goes away by itself after a while.
 */
function UndoBar({ undo, reload, onDone }: { undo: RankedUndo; reload: () => void; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    const t = setTimeout(onDone, result ? 6000 : 20000);
    return () => clearTimeout(t);
  }, [onDone, result]);

  return (
    <div className="pm-undo" role="status">
      <span>{result ? result.message : `${undo.name} følges nå på ranked-siden.`}</span>
      {!result && (
        <button
          type="button"
          className="pm-undo-button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await undoFollowRanked(undo);
              setResult(r);
              if (r.ok) {
                track("ranked_profile_undone", {});
                reload();
                router.refresh();
              }
            })
          }
        >
          {pending ? "Angrer …" : "Angre"}
        </button>
      )}
      <button type="button" className="pm-undo-close" aria-label="Lukk" title="Lukk" onClick={onDone}>
        <Icon name="remove" />
      </button>
    </div>
  );
}

function AddForm({
  directory,
  defaults,
  reload,
  via,
}: {
  directory: PlayerDirectory | null;
  defaults: PlayerManagerProps["defaults"];
  reload: () => void;
  via: string;
}) {
  const { pending, message, run } = useAction(reload);
  const [tag, setTag] = useState("");
  const [name, setName] = useState("");
  const [ranked, setRanked] = useState(Boolean(defaults?.ranked));
  const [wiki, setWiki] = useState(Boolean(defaults?.wiki));

  // Only "Lag wiki-side": the tag may be left empty (a person page without a tag).
  const wikiOnly = wiki && !ranked;
  const normalized = normalizeTag(tag);
  const already = directory && isValidTag(normalized) ? whereIs(directory, normalized) : null;

  return (
    <form
      className="auth-form rp-add"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => addPlayer(tag, name, { ranked, wiki }),
          (r) => {
            if (ranked) track("ranked_profile_added", { kind: "profil", via });
            if (r.url) track("page_created", { kind: "person", url: r.url, via });
            setTag("");
            setName("");
          },
        );
      }}
    >
      <div className="rp-add-row">
        <label>
          Tag
          <TagInput value={tag} onChange={setTag} required={!wikiOnly} />
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
        <button type="submit" className="auth-button" disabled={pending || (Boolean(already) && !ranked && !wiki)}>
          {pending ? "Legger til …" : "Legg til"}
        </button>
      </div>
      <div className="player-add-options">
        <label>
          <input type="checkbox" checked={ranked} onChange={(e) => setRanked(e.target.checked)} />
          Følg på ranked-siden
        </label>
        <label>
          <input type="checkbox" checked={wiki} onChange={(e) => setWiki(e.target.checked)} />
          Lag wiki-side
        </label>
      </div>
      <span className="auth-small">
        {already
          ? `${normalized} er allerede med, fra ${already}.`
          : "Uten kryss kommer spilleren bare på topplistene."}
      </span>
      <Status message={message} />
    </form>
  );
}

export default function PlayerManager({ initial, defaults, via, onClose }: PlayerManagerProps) {
  const [directory, setDirectory] = useState<PlayerDirectory | null>(initial ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<PlayerView>(defaults?.view ?? "all");
  const [order, setOrder] = useState<SortOrder>("name");
  const [query, setQuery] = useState("");
  const [undo, setUndo] = useState<RankedUndo | null>(null);
  const clearUndo = useCallback(() => setUndo(null), []);

  const reload = useCallback(() => {
    loadPlayers().then((r) => {
      if (r.ok) {
        setDirectory(r.directory);
        setLoadError(null);
      } else {
        setLoadError(r.message);
      }
    });
  }, []);

  // Opened without a server-rendered list (Topplister): fetch it now.
  useEffect(() => {
    if (!initial) reload();
  }, [initial, reload]);

  const players = directory?.players ?? [];
  const count = (v: PlayerView) => (v === "all" ? players.length : players.filter((p) => p.sources.includes(v)).length);
  const inView = view === "all" ? players : players.filter((p) => p.sources.includes(view));
  const shown = sortByOrder(
    inView.filter((p) => matchesQuery(p, query)),
    order,
  );
  const removed = (directory?.removed ?? []).filter(
    (r) => (view === "all" || view === r.source) && (!query.trim() || `${r.name} ${r.tag}`.toLowerCase().includes(query.trim().toLowerCase().replace(/^#/, ""))),
  );

  return (
    // Inline (Topplister) it's a box of its own; on /spillere/ the page's panel is the box.
    <OfferUndo.Provider value={setUndo}>
      <div className={onClose ? "auth-panel wide player-manager" : undefined}>
        <div className="player-manager-head">
          <h3>Legg til spiller</h3>
          {onClose && (
            <button type="button" className="auth-button secondary small" onClick={onClose}>
              Lukk
            </button>
          )}
        </div>
        <AddForm directory={directory} defaults={defaults} reload={reload} via={via} />
        <p className="auth-small">
          Lager du en klubb? <Link href="/ny/klubb/">Ny klubbside</Link>
        </p>

        <div className="rp-list-head">
          <div className="sort-toggle" role="group" aria-label="Vis">
            {(
              [
                ["all", "Alle"],
                ["wiki", "Wiki"],
                ["ranked", "Ranked"],
                ["topplister", "Bare topplister"],
              ] as Array<[PlayerView, string]>
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                className={view === v ? "active" : ""}
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {label} ({count(v)})
              </button>
            ))}
          </div>
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
        </div>

        {loadError && <p className="auth-error">{loadError}</p>}
        {!directory ? (
          !loadError && <p className="auth-small">Laster spillere …</p>
        ) : (
          <>
            {query.trim() && (
              <p className="auth-small">
                {shown.length} av {inView.length} treff
              </p>
            )}
            {shown.length === 0 ? (
              <p className="auth-small">{query.trim() ? "Ingen treff." : "Ingen ennå."}</p>
            ) : (
              <ul className="pm-list">
                {shown.map((p) => (
                  <PlayerRow key={p.tag} p={p} reload={reload} via={via} showDate={order === "newest"} />
                ))}
              </ul>
            )}
            {removed.length > 0 && (
              <details className="rp-removed" open={query.trim() ? true : undefined}>
                <summary>Fjernet ({removed.length})</summary>
                <ul className="pm-list">
                  {removed.map((r) => (
                    <RemovedRow key={r.tag} r={r} reload={reload} />
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
        {undo && <UndoBar key={undo.tag} undo={undo} reload={reload} onDone={clearUndo} />}
      </div>
    </OfferUndo.Provider>
  );
}
