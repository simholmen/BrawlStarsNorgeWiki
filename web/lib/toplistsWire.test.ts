import { describe, expect, it } from "vitest";
import type { Toplist, ToplistEntry } from "./toplistsBuild";
import { packLists, unpackLists } from "./toplistsWire";

function entry(tag: string, over: Partial<ToplistEntry> = {}): ToplistEntry {
  return {
    tag,
    name: `Spiller ${tag}`,
    inGameName: null,
    href: null,
    club: null,
    value: 100,
    detail: null,
    rankIcon: null,
    miniOf: null,
    ...over,
  };
}

const parts = [
  { label: "Brawlere", max: 100 },
  { label: "Nivåer", max: 1100 },
];
const coinsMax = [undefined, 1524500];

const plain: Toplist[] = [
  {
    key: "wins3v3",
    title: "3v3-seire",
    unit: "seire",
    entries: [
      entry("#2GY22JUR", { name: "Zimma", inGameName: "Zimma🏂", href: "/personer/zimma/", club: "Ace", value: 45115 }),
      entry("#RRCLPJVP", { value: 0 }),
    ],
  },
  {
    key: "maxed",
    title: "Maxet konto",
    unit: "%",
    entries: [
      entry("#2GY22JUR", {
        name: "Zimma",
        inGameName: "Zimma🏂",
        href: "/personer/zimma/",
        club: "Ace",
        value: 0.5,
        display: "50,0 %",
        breakdown: parts.map((p, i) => {
          const max = coinsMax[i];
          return max ? { ...p, owned: 40 + i, coins: { spent: 600000, max } } : { ...p, owned: 40 + i };
        }),
        coins: { spent: 600000, max: 1524500 },
      }),
    ],
  },
  {
    key: "ranked",
    title: "Høyeste ranked-elo",
    unit: "elo",
    entries: [entry("#RRCLPJVP", { value: 8250, detail: "Masters I · justert fra 9 816", rankIcon: "masters" })],
  },
];

const withMinis: Toplist[] = [
  {
    ...plain[0],
    entries: [...plain[0].entries, entry("#8Q0YGP8P", { name: "Zimma mini", miniOf: "Zimma", value: 12 })],
  },
  plain[1],
  plain[2],
];

describe("packLists / unpackLists", () => {
  const wire = packLists(plain, withMinis);

  it("rebuilds both sides exactly", () => {
    expect(unpackLists(wire, false)).toEqual(plain);
    expect(unpackLists(wire, true)).toEqual(withMinis);
  });

  it("sends each player once and the parts once", () => {
    expect(Object.keys(wire.players).sort()).toEqual(["#2GY22JUR", "#8Q0YGP8P", "#RRCLPJVP"]);
    expect(wire.parts).toEqual([parts[0], { ...parts[1], cm: 1524500 }]);
    expect(wire.lists[1].rows[0].o).toEqual([40, 41]);
    expect(wire.lists[1].rows[0].s).toEqual([0, 600000]);
    expect(JSON.stringify(wire).length).toBeLessThan(JSON.stringify({ plain, withMinis }).length);
  });
});
