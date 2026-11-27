import type { BreakdownPart, Toplist, ToplistEntry } from "./toplistsBuild";

// A compact form of the Topplister lists for sending to the browser (app/topplister/
// ToplistsView.tsx). The full lists repeat each player's name, club and link in all twelve lists
// (six, with and without minis), and every "Maxet konto" row repeats the same part names and
// maximums. Here each player is sent once and the parts once; unpackLists() rebuilds the lists.

type WirePlayer = { n: string; g?: string; h?: string; c?: string; m?: string };
/**
 * One row: tag, value, and only the fields it has (display, detail, rank icon, owned per part,
 * coins spent per part: 0 for a part without coins).
 */
type WireRow = { t: string; v: number; d?: string; x?: string; r?: string; o?: number[]; s?: number[] };
type WireList = Omit<Toplist, "entries"> & { rows: WireRow[] };

export type ToplistsWire = {
  players: Record<string, WirePlayer>;
  /** cm: what all of the part costs in coins, on the parts priced in coins. */
  parts: Array<{ label: string; max: number; cm?: number }>;
  lists: WireList[];
  listsWithMinis: WireList[];
};

export function packLists(lists: Toplist[], listsWithMinis: Toplist[]): ToplistsWire {
  const players: Record<string, WirePlayer> = {};
  let parts: ToplistsWire["parts"] = [];
  const packRow = (e: ToplistEntry): WireRow => {
    if (!players[e.tag]) {
      const p: WirePlayer = { n: e.name };
      if (e.inGameName) p.g = e.inGameName;
      if (e.href) p.h = e.href;
      if (e.club) p.c = e.club;
      if (e.miniOf) p.m = e.miniOf;
      players[e.tag] = p;
    } else if (e.miniOf && !players[e.tag].m) {
      players[e.tag].m = e.miniOf;
    }
    const row: WireRow = { t: e.tag, v: e.value };
    if (e.display) row.d = e.display;
    if (e.detail) row.x = e.detail;
    if (e.rankIcon) row.r = e.rankIcon;
    if (e.breakdown) {
      if (parts.length === 0) {
        parts = e.breakdown.map((b) => (b.coins ? { label: b.label, max: b.max, cm: b.coins.max } : { label: b.label, max: b.max }));
      }
      row.o = e.breakdown.map((b) => b.owned);
      if (e.breakdown.some((b) => b.coins)) row.s = e.breakdown.map((b) => b.coins?.spent ?? 0);
    }
    return row;
  };
  const pack = (ls: Toplist[]): WireList[] =>
    ls.map(({ entries, ...rest }) => ({ ...rest, rows: entries.map(packRow) }));
  // Pack first: packRow fills in `players` and `parts` as it goes.
  const packed = pack(lists);
  const packedWithMinis = pack(listsWithMinis);
  return { players, parts, lists: packed, listsWithMinis: packedWithMinis };
}

/** The lists again, for one side of the minis switch. `withMinis` keeps "mini av …". */
export function unpackLists(wire: ToplistsWire, withMinis: boolean): Toplist[] {
  return (withMinis ? wire.listsWithMinis : wire.lists).map(({ rows, ...rest }) => ({
    ...rest,
    entries: rows.map((row): ToplistEntry => {
      const p = wire.players[row.t];
      const entry: ToplistEntry = {
        tag: row.t,
        name: p.n,
        inGameName: p.g ?? null,
        href: p.h ?? null,
        club: p.c ?? null,
        value: row.v,
        detail: row.x ?? null,
        rankIcon: row.r ?? null,
        miniOf: withMinis ? (p.m ?? null) : null,
      };
      if (row.d !== undefined) entry.display = row.d;
      if (row.o) {
        entry.breakdown = row.o.map((owned, i): BreakdownPart => {
          const { label, max, cm } = wire.parts[i];
          const part: BreakdownPart = { label, max, owned };
          if (cm !== undefined) part.coins = { spent: row.s?.[i] ?? 0, max: cm };
          return part;
        });
        // In all: the sum of the parts (lib/toplistsBuild.ts ownedPoints / maxPoints).
        if (row.s) {
          entry.coins = {
            spent: row.s.reduce((a, b) => a + b, 0),
            max: wire.parts.reduce((a, b) => a + (b.cm ?? 0), 0),
          };
        }
      }
      return entry;
    }),
  }));
}
