// Turns the raw rows behind /topplister/ into ranked lists (pure, so it's tested on its own;
// lib/toplists.ts fetches the rows). Same account rules as rankedstats/toplists.py: wiki people
// with a valid tag, active main ranked profiles, and active extra players. Minis (ranked profiles
// with a main_tag) only count in the second set of lists, `listsWithMinis` ("Ta med minis").

import { isValidTag } from "./rankedTag";

export type StatsRow = {
  tag: string;
  profile_name: string | null;
  club_name: string | null;
  wins_3v3: number | null;
  wins_solo: number | null;
  wins_duo: number | null;
  fame: number | null;
  fame_tier_name: string | null;
  highest_ranked_elo: number | null;
  highest_ranked_rank: number | null;
  fetched_at: string;
  /** Experience (migration 024); null before the first run with it. */
  exp_level?: number | null;
  exp_points?: number | null;
  /** What the account owns ("Maxet konto", migration 022); null before the first run with it. */
  brawlers_owned?: number | null;
  owned_levels?: number | null;
  owned_star_powers?: number | null;
  owned_gadgets?: number | null;
  owned_gears?: number | null;
  owned_hypercharges?: number | null;
  owned_buffies?: number | null;
};

/** What one brawler can have (brawler_catalogue, migration 022). */
export type CatalogueRow = {
  /** Can be unlocked (owned by someone on the lists, migration 023). Unreleased ones don't count. */
  released?: boolean;
  star_powers: number;
  gadgets: number;
  gears: number;
  hypercharges: number;
  buffie_gadget: boolean;
  buffie_star_power: boolean;
  buffie_hypercharge: boolean;
};

/** Highest power level a brawler can reach. */
export const MAX_LEVEL = 11;

/**
 * Points a fully maxed account would have (scoring A): per brawler its max level, star powers,
 * gadgets, gears (catalogue already counts at most 6), hypercharge and the buffies that exist.
 */
export function maxPoints(catalogue: CatalogueRow[]): number {
  return releasedOnly(catalogue).reduce(
    (sum, b) =>
      sum +
      MAX_LEVEL +
      b.star_powers +
      b.gadgets +
      b.gears +
      b.hypercharges +
      Number(b.buffie_gadget) +
      Number(b.buffie_star_power) +
      Number(b.buffie_hypercharge),
    0,
  );
}

/** Brawlers that can be unlocked. Rows without the flag (before migration 023) all count. */
export function releasedOnly(catalogue: CatalogueRow[]): CatalogueRow[] {
  return catalogue.filter((b) => b.released !== false);
}

/** Each part of the score for one account: brawlers, then the parts that add up to the %. */
export function breakdown(s: StatsRow, catalogue: CatalogueRow[]): BreakdownPart[] {
  const released = releasedOnly(catalogue);
  const sum = (f: (b: CatalogueRow) => number) => released.reduce((n, b) => n + f(b), 0);
  return [
    { label: "Brawlere", owned: s.brawlers_owned ?? 0, max: released.length },
    { label: "Nivåer", owned: s.owned_levels ?? 0, max: released.length * MAX_LEVEL },
    { label: "Star powers", owned: s.owned_star_powers ?? 0, max: sum((b) => b.star_powers) },
    { label: "Gadgets", owned: s.owned_gadgets ?? 0, max: sum((b) => b.gadgets) },
    { label: "Gears", owned: s.owned_gears ?? 0, max: sum((b) => b.gears) },
    { label: "Hypercharges", owned: s.owned_hypercharges ?? 0, max: sum((b) => b.hypercharges) },
    {
      label: "Buffies",
      owned: s.owned_buffies ?? 0,
      max: sum((b) => Number(b.buffie_gadget) + Number(b.buffie_star_power) + Number(b.buffie_hypercharge)),
    },
  ];
}

/** Points the account has, same scoring as maxPoints. */
export function ownedPoints(s: StatsRow): number {
  return (
    (s.owned_levels ?? 0) +
    (s.owned_star_powers ?? 0) +
    (s.owned_gadgets ?? 0) +
    (s.owned_gears ?? 0) +
    (s.owned_hypercharges ?? 0) +
    (s.owned_buffies ?? 0)
  );
}

export type ExtraPlayer = {
  tag: string;
  name: string;
  active: boolean;
  created_by_name: string | null;
  created_at: string;
};

export type ToplistEntry = {
  tag: string;
  /** Wiki name, else ranked-profile name, else the name the editor gave, else in-game name. */
  name: string;
  /** In-game name when it differs from `name`. */
  inGameName: string | null;
  /** Wiki page, when the account belongs to one. */
  href: string | null;
  club: string | null;
  value: number;
  /** The value as shown, when it isn't a plain number ("96,4 %"). */
  display?: string;
  /** Maxet konto: what the account has of each part, against the max. */
  breakdown?: BreakdownPart[];
  /** Second line: "solo 2 303 · duo 2 177", a fame tier, a rank. */
  detail: string | null;
  /** Rank sticker for the ranked list ("masters"), see docs/rankedstats/images/ranks/. */
  rankIcon: string | null;
  /** With minis: this is a mini, standing alone; the main account's name. */
  miniOf?: string | null;
};

export type BreakdownPart = { label: string; owned: number; max: number };

export type CategoryKey = "wins3v3" | "showdown" | "fame" | "ranked" | "experience" | "maxed";

export type Toplist = { key: CategoryKey; title: string; unit: string; entries: ToplistEntry[] };

/** An active mini ranked profile (ranked_profiles.main_tag set). */
export type MiniProfile = { tag: string; name: string; main_tag: string };

export type Toplists = {
  lists: Toplist[];
  /**
   * The same lists with minis: 3v3, Showdown and XP add each mini onto its main account; fame,
   * elo and maxed list minis as accounts of their own.
   */
  listsWithMinis: Toplist[];
  /** Minis with numbers (0: the page hides the checkbox). */
  miniCount: number;
  /** Newest fetch time, ISO; null before the first daily run. */
  updatedAt: string | null;
  /** How many accounts the lists are drawn from (with fetched stats). */
  accounts: number;
  extras: ExtraPlayer[];
  /** Tags already on the lists through a wiki page or the ranked roster (for the add form). */
  coveredTags: Record<string, string>;
  /** Every account, from all sources, sorted by name (the add box's "Alle" view). */
  everyone: AccountSummary[];
  /** Brawlers in the game, and how many have buffies (for the "Maxet konto" explanation). */
  brawlerCount: number;
  buffieBrawlers: number;
};

/** Where an account comes from: a wiki page, the ranked roster (main or mini), the add box. */
export type AccountSource = "wiki" | "ranked" | "mini" | "topplister";

export type AccountSummary = {
  tag: string;
  name: string;
  /** Wiki page, when there is one. */
  href: string | null;
  sources: AccountSource[];
  /** For a mini: the main account's name. */
  miniOf: string | null;
  /** Has numbers from the API yet. */
  hasStats: boolean;
};

const pct = new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const nb = new Intl.NumberFormat("nb-NO");

export function formatNumber(n: number): string {
  return nb.format(n);
}

/** "ALIEN FAME I" -> "Alien Fame I"; Roman numerals stay upper case. */
export function prettyName(s: string | null | undefined): string | null {
  if (!s) return null;
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (/^[ivx]+$/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/**
 * Elo where each rank from Diamond up starts (rank_tiers.value): Diamond and Mythic are 500 apart
 * from 3000, Legendary 750 apart from 6000, Masters and Pro 1000 apart from 8250.
 */
const RANK_FLOOR: Record<number, number> = {
  10: 3000, // Diamond I
  11: 3500, // Diamond II
  12: 4000, // Diamond III
  13: 4500, // Mythic I
  14: 5000, // Mythic II
  15: 5500, // Mythic III
  16: 6000, // Legendary I
  17: 6750, // Legendary II
  18: 7500, // Legendary III
  19: 8250, // Masters I
  20: 9250, // Masters II
  21: 10250, // Masters III
  22: 11250, // Pro
};

/**
 * Manual corrections, by tag: the elo to show instead of the rule below, for accounts where an
 * editor knows the real number. Still shown as "justert fra" the profile's elo.
 */
export const ELO_OVERRIDES: Record<string, number> = {
  "#92GC0C9Q": 10083, // Daniel: profile shows 11 642 at Masters II
};

/**
 * Highest all-time ranked elo, made comparable across the old and new ranked systems. Some
 * accounts carry an all-time elo from the old system that is higher than their all-time rank
 * allows (e.g. 9816 elo but only Masters I). For Diamond I to Masters III: when the elo reaches
 * the start of the next rank up, it's set to the start of the rank they actually reached.
 */
export function fairRankedElo(elo: number, rank: number | null, tag?: string): number {
  if (tag && tag in ELO_OVERRIDES) return ELO_OVERRIDES[tag];
  if (rank === null || rank < 10 || rank > 21) return elo;
  const floor = RANK_FLOOR[rank];
  const nextFloor = RANK_FLOOR[rank + 1];
  return elo >= nextFloor ? floor : elo;
}

function tagOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const tag = `#${raw.trim().replace(/^#/, "").toUpperCase()}`;
  return isValidTag(tag) ? tag : null;
}

export function buildToplists(input: {
  stats: StatsRow[];
  people: Array<{ slug: string; name: string; bsid: string | null }>;
  profiles: Array<{ tag: string; name: string }>;
  extras: ExtraPlayer[];
  tiers: Array<{ value: number; label: string; tier_name: string }>;
  catalogue?: CatalogueRow[];
  minis?: MiniProfile[];
}): Toplists {
  // Who is on the lists, and under which name (first source wins).
  const accounts = new Map<string, { name: string; href: string | null }>();
  const coveredTags: Record<string, string> = {};
  for (const p of input.people) {
    const tag = tagOf(p.bsid);
    if (!tag || accounts.has(tag)) continue;
    accounts.set(tag, { name: p.name, href: `/personer/${p.slug}/` });
    coveredTags[tag] = `wiki-siden til ${p.name}`;
  }
  for (const r of input.profiles) {
    const tag = tagOf(r.tag);
    if (!tag) continue;
    if (!accounts.has(tag)) accounts.set(tag, { name: r.name, href: null });
    coveredTags[tag] ??= `ranked-profilen ${r.name}`;
  }
  for (const e of input.extras) {
    const tag = tagOf(e.tag);
    if (tag && e.active && !accounts.has(tag)) accounts.set(tag, { name: e.name, href: null });
  }

  const tierByValue = new Map(input.tiers.map((t) => [t.value, t]));
  const statsByTag = new Map(input.stats.map((s) => [s.tag, s]));
  const rows = input.stats.filter((s) => accounts.has(s.tag));

  // Minis: who they are, and which ones add onto a main that's on the lists with numbers. A mini
  // that's on the lists by itself (wiki page, extra player) already counts there, so it's skipped.
  type Who = { name: string; href: string | null; miniOf?: string };
  const withMinis = new Map<string, Who>(accounts);
  const miniRows: StatsRow[] = [];
  const minisOf = new Map<string, StatsRow[]>();
  for (const m of input.minis ?? []) {
    const tag = tagOf(m.tag);
    const main = tagOf(m.main_tag);
    const s = tag ? statsByTag.get(tag) : undefined;
    if (!tag || !main || !s || withMinis.has(tag)) continue;
    const mainWho = accounts.get(main);
    withMinis.set(tag, { name: m.name, href: null, miniOf: mainWho?.name ?? main });
    miniRows.push(s);
    if (mainWho && statsByTag.has(main)) minisOf.set(main, [...(minisOf.get(main) ?? []), s]);
  }
  const added = new Set([...minisOf.values()].flat().map((s) => s.tag));

  const lists = makeLists(accounts, rows, rows, new Map());
  const listsWithMinis = makeLists(
    withMinis,
    [...rows, ...miniRows],
    [...rows, ...miniRows.filter((s) => !added.has(s.tag))],
    minisOf,
  );

  // Every account with all the places it comes from (one account can be on the wiki, the ranked
  // roster and in the add box at once). Named like on the lists: the first source wins.
  const everyoneMap = new Map<string, AccountSummary>();
  const note = (raw: string | null | undefined, source: AccountSource, name: string, extra: Partial<AccountSummary> = {}) => {
    const tag = tagOf(raw);
    if (!tag) return;
    const a = everyoneMap.get(tag);
    if (a) {
      if (!a.sources.includes(source)) a.sources.push(source);
      a.href ??= extra.href ?? null;
      return;
    }
    everyoneMap.set(tag, {
      tag,
      name,
      href: null,
      miniOf: null,
      hasStats: statsByTag.has(tag),
      ...extra,
      sources: [source],
    });
  };
  for (const p of input.people) note(p.bsid, "wiki", p.name, { href: `/personer/${p.slug}/` });
  for (const r of input.profiles) note(r.tag, "ranked", r.name);
  for (const m of input.minis ?? []) {
    const main = tagOf(m.main_tag);
    note(m.tag, "mini", m.name, { miniOf: (main && accounts.get(main)?.name) || main });
  }
  for (const e of input.extras) if (e.active) note(e.tag, "topplister", e.name);
  const collator = new Intl.Collator("nb", { sensitivity: "base" });
  const everyone = [...everyoneMap.values()].sort((a, b) => collator.compare(a.name, b.name));

  const updatedAt = rows.reduce<string | null>((max, s) => (!max || s.fetched_at > max ? s.fetched_at : max), null);
  const releasedCatalogue = releasedOnly(input.catalogue ?? []);
  const buffieBrawlers = releasedCatalogue.filter(
    (b) => b.buffie_gadget || b.buffie_star_power || b.buffie_hypercharge,
  ).length;
  return {
    lists,
    listsWithMinis,
    miniCount: miniRows.length,
    updatedAt,
    accounts: rows.length,
    extras: input.extras,
    coveredTags,
    everyone,
    brawlerCount: releasedCatalogue.length,
    buffieBrawlers,
  };

  /**
   * One set of lists. `standalone`: the accounts for fame, elo and maxed. `summed`: the accounts
   * for 3v3, Showdown and XP, where each also gets the numbers of its minis in `minisOf`.
   */
  function makeLists(
    who: Map<string, Who>,
    standalone: StatsRow[],
    summed: StatsRow[],
    minisOf: Map<string, StatsRow[]>,
  ): Toplist[] {
    function entry(s: StatsRow, value: number, detail: string | null, rankIcon: string | null = null): ToplistEntry {
      const w = who.get(s.tag)!;
      const inGame = s.profile_name?.trim() || null;
      return {
        tag: s.tag,
        name: w.name || inGame || s.tag,
        inGameName: inGame && inGame !== w.name ? inGame : null,
        href: w.href,
        club: s.club_name,
        value,
        detail,
        rankIcon,
        miniOf: w.miniOf ?? null,
      };
    }

    /** The account plus its minis, for one number. */
    function total(s: StatsRow, f: (r: StatsRow) => number | null | undefined): number {
      return [s, ...(minisOf.get(s.tag) ?? [])].reduce((n, r) => n + (f(r) ?? 0), 0);
    }

    /** "med 2 minis" when minis were added on. */
    function withNote(s: StatsRow): string {
      const n = minisOf.get(s.tag)?.length ?? 0;
      return n ? `med ${n} ${n === 1 ? "mini" : "minis"}` : "";
    }

    function joined(...parts: Array<string | null>): string | null {
      return parts.filter(Boolean).join(" · ") || null;
    }

  function ranked(list: ToplistEntry[]): ToplistEntry[] {
    return list.filter((e) => e.value > 0).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "nb"));
  }

  const lists: Toplist[] = [
    {
      key: "wins3v3",
      title: "3v3-seire",
      unit: "seire",
      entries: ranked(summed.map((s) => entry(s, total(s, (r) => r.wins_3v3), joined(withNote(s))))),
    },
    {
      key: "showdown",
      title: "Showdown-seire",
      unit: "seire",
      entries: ranked(
        summed.map((s) => {
          const solo = total(s, (r) => r.wins_solo);
          const duo = total(s, (r) => r.wins_duo);
          return entry(s, solo + duo, joined(`solo ${formatNumber(solo)} · duo ${formatNumber(duo)}`, withNote(s)));
        }),
      ),
    },
    {
      key: "fame",
      title: "Fame",
      unit: "fame",
      entries: ranked(standalone.map((s) => entry(s, s.fame ?? 0, prettyName(s.fame_tier_name)))),
    },
    {
      key: "ranked",
      title: "Høyeste ranked-elo",
      unit: "elo",
      entries: ranked(
        standalone.map((s) => {
          const tier = s.highest_ranked_rank ? tierByValue.get(s.highest_ranked_rank) : undefined;
          const raw = s.highest_ranked_elo ?? 0;
          const elo = fairRankedElo(raw, s.highest_ranked_rank, s.tag);
          // Say so when the number was lowered, with what the profile shows.
          const detail = elo !== raw ? `${tier?.label ?? ""} · justert fra ${formatNumber(raw)}`.trim() : (tier?.label ?? null);
          return entry(s, elo, detail, tier?.tier_name.toLowerCase() ?? null);
        }),
      ),
    },
  ];

  // Maxet konto: points owned / points possible over every brawler in the game.
  const catalogue = releasedOnly(input.catalogue ?? []);
  const possible = maxPoints(catalogue);
  lists.push({
    key: "maxed",
    title: "Maxet konto",
    unit: "%",
    entries: possible
      ? ranked(
          standalone
            .filter((s) => s.brawlers_owned != null)
            .map((s) => {
              const value = Math.min(100, (ownedPoints(s) / possible) * 100);
              const e = entry(s, value, `${s.brawlers_owned}/${catalogue.length} brawlere`);
              return { ...e, display: `${pct.format(value)} %`, breakdown: breakdown(s, catalogue) };
            }),
        )
      : [],
  });

  // XP-nivå (last list): ranked by experience points (exact), shown as the level, which is what
  // people know. With minis, both add up.
  lists.push({
    key: "experience",
    title: "XP-nivå",
    unit: "nivå",
    entries: ranked(
      summed
        .filter((s) => s.exp_points != null)
        .map((s) => {
          const points = total(s, (r) => r.exp_points);
          return {
            ...entry(s, points, joined(`${formatNumber(points)} XP`, withNote(s))),
            display: formatNumber(total(s, (r) => r.exp_level)),
          };
        }),
    ),
  });

  return lists;
  }
}
