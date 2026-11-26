// Turns the raw rows behind /topplister/ into ranked lists (pure, so it's tested on its own;
// lib/toplists.ts fetches the rows). Same account rules as rankedstats/toplists.py: wiki people
// with a valid tag, active main ranked profiles, and active extra players.

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
};

export type BreakdownPart = { label: string; owned: number; max: number };

export type CategoryKey = "wins3v3" | "showdown" | "fame" | "ranked" | "experience" | "maxed";

export type Toplist = { key: CategoryKey; title: string; unit: string; entries: ToplistEntry[] };

export type Toplists = {
  lists: Toplist[];
  /** Newest fetch time, ISO; null before the first daily run. */
  updatedAt: string | null;
  /** How many accounts the lists are drawn from (with fetched stats). */
  accounts: number;
  extras: ExtraPlayer[];
  /** Tags already on the lists through a wiki page or the ranked roster (for the add form). */
  coveredTags: Record<string, string>;
  /** Brawlers in the game, and how many have buffies (for the "Maxet konto" explanation). */
  brawlerCount: number;
  buffieBrawlers: number;
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
  const rows = input.stats.filter((s) => accounts.has(s.tag));

  function entry(s: StatsRow, value: number, detail: string | null, rankIcon: string | null = null): ToplistEntry {
    const who = accounts.get(s.tag)!;
    const inGame = s.profile_name?.trim() || null;
    return {
      tag: s.tag,
      name: who.name || inGame || s.tag,
      inGameName: inGame && inGame !== who.name ? inGame : null,
      href: who.href,
      club: s.club_name,
      value,
      detail,
      rankIcon,
    };
  }

  function ranked(list: ToplistEntry[]): ToplistEntry[] {
    return list.filter((e) => e.value > 0).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "nb"));
  }

  const lists: Toplist[] = [
    {
      key: "wins3v3",
      title: "3v3-seire",
      unit: "seire",
      entries: ranked(rows.map((s) => entry(s, s.wins_3v3 ?? 0, null))),
    },
    {
      key: "showdown",
      title: "Showdown-seire",
      unit: "seire",
      entries: ranked(
        rows.map((s) =>
          entry(
            s,
            (s.wins_solo ?? 0) + (s.wins_duo ?? 0),
            `solo ${formatNumber(s.wins_solo ?? 0)} · duo ${formatNumber(s.wins_duo ?? 0)}`,
          ),
        ),
      ),
    },
    {
      key: "fame",
      title: "Fame",
      unit: "fame",
      entries: ranked(rows.map((s) => entry(s, s.fame ?? 0, prettyName(s.fame_tier_name)))),
    },
    {
      key: "ranked",
      title: "Høyeste ranked-elo",
      unit: "elo",
      entries: ranked(
        rows.map((s) => {
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
          rows
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
  // people know.
  lists.push({
    key: "experience",
    title: "XP-nivå",
    unit: "nivå",
    entries: ranked(
      rows
        .filter((s) => s.exp_points != null)
        .map((s) => ({
          ...entry(s, s.exp_points ?? 0, `${formatNumber(s.exp_points ?? 0)} XP`),
          display: formatNumber(s.exp_level ?? 0),
        })),
    ),
  });

  const updatedAt = rows.reduce<string | null>((max, s) => (!max || s.fetched_at > max ? s.fetched_at : max), null);

  const buffieBrawlers = catalogue.filter((b) => b.buffie_gadget || b.buffie_star_power || b.buffie_hypercharge).length;
  return {
    lists,
    updatedAt,
    accounts: rows.length,
    extras: input.extras,
    coveredTags,
    brawlerCount: catalogue.length,
    buffieBrawlers,
  };
}
