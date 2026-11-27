// Turns the raw rows behind /topplister/ into ranked lists (pure, so it's tested on its own;
// lib/toplists.ts fetches the rows). Same account rules as rankedstats/toplists.py: wiki people
// with a valid tag, active main ranked profiles, and active extra players. Minis (ranked profiles
// with a main_tag) only count in the second set of lists, `listsWithMinis` ("Ta med minis").

import { tagOf } from "./rankedTag";

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
  /** What those levels cost in coins (migration 025, rankedstats/toplists.py LEVEL_UPGRADES). */
  owned_level_coins?: number | null;
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
 * "Maxet konto" weighs everything by what it costs in coins; power points count as 2 coins each
 * (the shop price). Same level table as rankedstats/toplists.py LEVEL_UPGRADES, which stores
 * owned_level_coins per account.
 */
export const COINS_PER_POWER_POINT = 2;
/** [power points, coins] to go from level n-1 to n, for n = 2..11. Total: 3740 PP + 7765 coins. */
export const LEVEL_UPGRADES: [number, number][] = [
  [20, 20], [30, 35], [50, 75], [80, 140], [130, 290],
  [210, 480], [340, 800], [550, 1250], [890, 1875], [1440, 2800],
];
export const COST = {
  starPower: 2000,
  gadget: 1000,
  gear: 1000,
  hypercharge: 5000,
  /** 2000 power points + 1000 coins. */
  buffie: 2000 * COINS_PER_POWER_POINT + 1000,
};

/** Coins (power points counted as coins) to take a brawler from level 1 to `level`. */
export function levelCoins(level: number): number {
  return LEVEL_UPGRADES.slice(0, Math.max(0, Math.min(level, MAX_LEVEL) - 1)).reduce(
    (sum, [pp, coins]) => sum + pp * COINS_PER_POWER_POINT + coins,
    0,
  );
}

/**
 * Coins a fully maxed account would have spent: per brawler level 11, its star powers, gadgets,
 * gears (catalogue already counts at most 6), hypercharge and the buffies that exist.
 */
export function maxPoints(catalogue: CatalogueRow[]): number {
  return releasedOnly(catalogue).reduce(
    (sum, b) =>
      sum +
      levelCoins(MAX_LEVEL) +
      b.star_powers * COST.starPower +
      b.gadgets * COST.gadget +
      b.gears * COST.gear +
      b.hypercharges * COST.hypercharge +
      (Number(b.buffie_gadget) + Number(b.buffie_star_power) + Number(b.buffie_hypercharge)) * COST.buffie,
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
  /** A part priced at `price` coins each. */
  const priced = (label: string, owned: number, max: number, price: number): BreakdownPart => ({
    label,
    owned,
    max,
    coins: { spent: owned * price, max: max * price },
  });
  const buffies = sum((b) => Number(b.buffie_gadget) + Number(b.buffie_star_power) + Number(b.buffie_hypercharge));
  return [
    { label: "Brawlere", owned: s.brawlers_owned ?? 0, max: released.length },
    {
      label: "Nivåer",
      owned: s.owned_levels ?? 0,
      max: released.length * MAX_LEVEL,
      coins: { spent: ownedLevelCoins(s), max: released.length * levelCoins(MAX_LEVEL) },
    },
    priced("Star powers", s.owned_star_powers ?? 0, sum((b) => b.star_powers), COST.starPower),
    priced("Gadgets", s.owned_gadgets ?? 0, sum((b) => b.gadgets), COST.gadget),
    priced("Gears", s.owned_gears ?? 0, sum((b) => b.gears), COST.gear),
    priced("Hypercharges", s.owned_hypercharges ?? 0, sum((b) => b.hypercharges), COST.hypercharge),
    priced("Buffies", s.owned_buffies ?? 0, buffies, COST.buffie),
  ];
}

/** Coins the account has spent, same scoring as maxPoints. */
export function ownedPoints(s: StatsRow): number {
  return (
    ownedLevelCoins(s) +
    (s.owned_star_powers ?? 0) * COST.starPower +
    (s.owned_gadgets ?? 0) * COST.gadget +
    (s.owned_gears ?? 0) * COST.gear +
    (s.owned_hypercharges ?? 0) * COST.hypercharge +
    (s.owned_buffies ?? 0) * COST.buffie
  );
}

/**
 * What the account's levels cost. Rows fetched before migration 025 only have the sum of levels:
 * then it's estimated as every owned brawler at the average level, until the next fetch.
 */
function ownedLevelCoins(s: StatsRow): number {
  if (s.owned_level_coins != null) return s.owned_level_coins;
  const owned = s.brawlers_owned ?? 0;
  if (!owned) return 0;
  const avg = (s.owned_levels ?? 0) / owned;
  const low = Math.floor(avg);
  const perBrawler = levelCoins(low) + (avg - low) * (levelCoins(low + 1) - levelCoins(low));
  return Math.round(perBrawler * owned);
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
  /** Maxet konto: coins spent in all, and what a fully maxed account costs. */
  coins?: { spent: number; max: number };
  /** Second line: "solo 2 303 · duo 2 177", a fame tier, a rank. */
  detail: string | null;
  /** Rank sticker for the ranked list ("masters"), see docs/rankedstats/images/ranks/. */
  rankIcon: string | null;
  /** With minis: this is a mini, standing alone; the main account's name. */
  miniOf?: string | null;
};

export type BreakdownPart = {
  label: string;
  owned: number;
  max: number;
  /** Coins (power points as 2 coins) spent on this part, and what all of it costs. Not on "Brawlere". */
  coins?: { spent: number; max: number };
};

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
  for (const p of input.people) {
    const tag = tagOf(p.bsid);
    if (!tag || accounts.has(tag)) continue;
    accounts.set(tag, { name: p.name, href: `/personer/${p.slug}/` });
  }
  for (const r of input.profiles) {
    const tag = tagOf(r.tag);
    if (!tag) continue;
    if (!accounts.has(tag)) accounts.set(tag, { name: r.name, href: null });
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

  // Maxet konto: coins spent / coins a fully maxed account would have spent, over every brawler.
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
              return {
                ...e,
                display: `${pct.format(value)} %`,
                breakdown: breakdown(s, catalogue),
                coins: { spent: ownedPoints(s), max: possible },
              };
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
