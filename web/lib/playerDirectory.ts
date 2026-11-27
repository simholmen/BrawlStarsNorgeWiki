import { tagOf } from "./rankedTag";

// Every player the site knows, from the three places a player can be added: a wiki page with a
// tag (people.bsid), the ranked roster (ranked_profiles, with mini accounts under a main) and the
// toplist-only extras (toplist_players). One row per tag, with all the places it comes from. Used
// by the shared "Legg til spiller" box (components/players/PlayerManager.tsx) on /spillere/ and
// on Topplister.

export type PlayerSource = "wiki" | "ranked" | "topplister";

export type PersonRow = { slug: string; name: string; bsid: string | null; created_at: string };

export type RankedRow = {
  tag: string;
  name: string;
  active: boolean;
  /** Set for a mini account: the main profile's tag. */
  main_tag: string | null;
  created_at: string;
  created_by_name: string | null;
  updated_at: string;
  updated_by_name: string | null;
};

export type ExtraRow = {
  tag: string;
  name: string;
  active: boolean;
  created_at: string;
  created_by_name: string | null;
  updated_at: string;
  updated_by_name: string | null;
};

type Added = { name: string; created_at: string; created_by_name: string | null };

export type DirectoryMini = Added & { tag: string };

export type DirectoryPlayer = {
  tag: string;
  /** Shown name: the wiki page's, else the ranked profile's, else the toplist-only one. */
  name: string;
  sources: PlayerSource[];
  wiki: { slug: string; name: string } | null;
  /** The active main ranked profile. */
  ranked: Added | null;
  /** The active toplist-only row. */
  extra: Added | null;
  /** Active mini accounts under the ranked profile. */
  minis: DirectoryMini[];
  /** When it was last added somewhere, and by whom ("Nyeste først"). */
  created_at: string;
  created_by_name: string | null;
};

/** A removed ranked profile or toplist-only player whose tag isn't on the site any more. */
export type RemovedPlayer = {
  tag: string;
  name: string;
  source: "ranked" | "topplister";
  /** For a removed mini: the main account's name. */
  miniOf: string | null;
  removed_at: string;
  removed_by_name: string | null;
};

export type PlayerDirectory = { players: DirectoryPlayer[]; removed: RemovedPlayer[] };

const collator = new Intl.Collator("nb", { sensitivity: "base" });

export function buildPlayerDirectory(input: {
  people: PersonRow[];
  ranked: RankedRow[];
  extras: ExtraRow[];
}): PlayerDirectory {
  const byTag = new Map<string, DirectoryPlayer>();
  const entry = (tag: string, name: string): DirectoryPlayer => {
    let p = byTag.get(tag);
    if (!p) {
      p = { tag, name, sources: [], wiki: null, ranked: null, extra: null, minis: [], created_at: "", created_by_name: null };
      byTag.set(tag, p);
    }
    return p;
  };
  const stamp = (p: DirectoryPlayer, source: PlayerSource, added: { created_at: string; created_by_name: string | null }) => {
    if (!p.sources.includes(source)) p.sources.push(source);
    if (added.created_at > p.created_at) {
      p.created_at = added.created_at;
      p.created_by_name = added.created_by_name;
    }
  };

  for (const person of input.people) {
    const tag = tagOf(person.bsid);
    if (!tag || byTag.get(tag)?.wiki) continue;
    const p = entry(tag, person.name);
    p.wiki = { slug: person.slug, name: person.name };
    stamp(p, "wiki", { created_at: person.created_at, created_by_name: null });
  }

  const mains = input.ranked.filter((r) => r.active && !r.main_tag);
  const nameByRankedTag = new Map(input.ranked.map((r) => [r.tag, r.name]));
  for (const r of mains) {
    const tag = tagOf(r.tag);
    if (!tag) continue;
    const p = entry(tag, r.name);
    p.ranked = { name: r.name, created_at: r.created_at, created_by_name: r.created_by_name };
    stamp(p, "ranked", r);
  }
  for (const r of input.ranked) {
    if (!r.active || !r.main_tag) continue;
    const main = byTag.get(tagOf(r.main_tag) ?? "");
    if (!main?.ranked) continue;
    main.minis.push({ tag: r.tag, name: r.name, created_at: r.created_at, created_by_name: r.created_by_name });
  }

  for (const e of input.extras) {
    const tag = tagOf(e.tag);
    if (!tag || !e.active) continue;
    const p = entry(tag, e.name);
    p.extra = { name: e.name, created_at: e.created_at, created_by_name: e.created_by_name };
    stamp(p, "topplister", e);
  }

  // Shown name: wiki first, then ranked, then the toplist-only name (like on the toplists).
  for (const p of byTag.values()) {
    p.name = p.wiki?.name ?? p.ranked?.name ?? p.extra?.name ?? p.name;
    p.minis.sort((a, b) => collator.compare(a.name, b.name));
  }
  const players = [...byTag.values()].sort((a, b) => collator.compare(a.name, b.name));

  // Removed: only tags that aren't on the site in any other way (an active mini counts too).
  const onSite = new Set<string>(byTag.keys());
  for (const p of players) for (const m of p.minis) onSite.add(m.tag);
  const removedByTag = new Map<string, RemovedPlayer>();
  for (const r of input.ranked) {
    if (r.active || onSite.has(r.tag)) continue;
    removedByTag.set(r.tag, {
      tag: r.tag,
      name: r.name,
      source: "ranked",
      miniOf: r.main_tag ? (nameByRankedTag.get(r.main_tag) ?? r.main_tag) : null,
      removed_at: r.updated_at,
      removed_by_name: r.updated_by_name,
    });
  }
  for (const e of input.extras) {
    if (e.active || onSite.has(e.tag) || removedByTag.has(e.tag)) continue;
    removedByTag.set(e.tag, {
      tag: e.tag,
      name: e.name,
      source: "topplister",
      miniOf: null,
      removed_at: e.updated_at,
      removed_by_name: e.updated_by_name,
    });
  }
  const removed = [...removedByTag.values()].sort((a, b) => collator.compare(a.name, b.name));

  return { players, removed };
}

/** Where a tag is already on the site, for the add form ("… er allerede med, fra …"); null if nowhere. */
export function whereIs(directory: PlayerDirectory, tag: string): string | null {
  for (const p of directory.players) {
    if (p.tag === tag) {
      const places = [
        p.wiki && `wiki-siden til ${p.wiki.name}`,
        p.ranked && `ranked-profilen ${p.ranked.name}`,
        p.extra && "topplistene",
      ].filter(Boolean);
      return places.join(" og ");
    }
    const mini = p.minis.find((m) => m.tag === tag);
    if (mini) return `mini-konto av ${p.name}`;
  }
  return null;
}

export type SortOrder = "name" | "newest";

/** Sorted copy: by name (A-Å), or by when it was added, newest first. */
export function sortByOrder<T extends { name: string; created_at: string }>(list: T[], order: SortOrder): T[] {
  return [...list].sort((a, b) =>
    order === "newest" ? b.created_at.localeCompare(a.created_at) : collator.compare(a.name, b.name),
  );
}

/** Search by name or tag ("2gy22" finds #2GY22JUR), also through a player's minis. */
export function matchesQuery(p: DirectoryPlayer, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/^#/, "");
  if (!q) return true;
  const hit = (name: string, tag: string) => name.toLowerCase().includes(q) || tag.toLowerCase().includes(q);
  return (
    hit(p.name, p.tag) ||
    (p.ranked !== null && p.ranked.name.toLowerCase().includes(q)) ||
    (p.extra !== null && p.extra.name.toLowerCase().includes(q)) ||
    p.minis.some((m) => hit(m.name, m.tag))
  );
}
