import { describe, expect, it } from "vitest";
import { buildToplists, fairRankedElo, levelCoins, maxPoints, ownedPoints, prettyName, type StatsRow } from "./toplistsBuild";

function stats(tag: string, over: Partial<StatsRow> = {}): StatsRow {
  return {
    tag,
    profile_name: null,
    club_name: null,
    wins_3v3: null,
    wins_solo: null,
    wins_duo: null,
    fame: null,
    fame_tier_name: null,
    highest_ranked_elo: null,
    highest_ranked_rank: null,
    fetched_at: "2026-11-26T04:10:00+00:00",
    ...over,
  };
}

const base = {
  people: [{ slug: "zimma", name: "Zimma", bsid: "2gy22jur" }],
  profiles: [
    { tag: "#2GY22JUR", name: "Zimma ranked" },
    { tag: "#9YRVPPGCC", name: "Ranked-spiller" },
  ],
  extras: [
    { tag: "#RRCLPJVP", name: "Ekstra", active: true, created_by_name: "Eddie", created_at: "" },
    { tag: "#R8RP0Y0U", name: "Fjernet", active: false, created_by_name: null, created_at: "" },
  ],
  tiers: [{ value: 19, label: "Masters I", tier_name: "Masters" }],
};

describe("buildToplists", () => {
  const result = buildToplists({
    ...base,
    stats: [
      stats("#2GY22JUR", {
        profile_name: "Zimma🏂",
        wins_3v3: 45115,
        wins_solo: 2303,
        wins_duo: 2177,
        fame: 192530,
        fame_tier_name: "ALIEN FAME I",
        highest_ranked_elo: 9816,
        highest_ranked_rank: 19,
        fetched_at: "2026-11-26T04:11:00+00:00",
      }),
      stats("#9YRVPPGCC", { wins_3v3: 50000, wins_solo: 10 }),
      stats("#RRCLPJVP", { wins_3v3: 100, profile_name: "Ekstra" }),
      stats("#R8RP0Y0U", { wins_3v3: 999999 }), // removed extra: not shown
      stats("#YQ29980", { wins_3v3: 999999 }), // not on any source: not shown
    ],
  });
  const list = (key: string) => result.lists.find((l) => l.key === key)!;

  it("ranks by value, highest first, only current accounts", () => {
    expect(list("wins3v3").entries.map((e) => e.tag)).toEqual(["#9YRVPPGCC", "#2GY22JUR", "#RRCLPJVP"]);
    expect(result.accounts).toBe(3);
  });

  it("names accounts after the wiki first, then ranked profile, then extra", () => {
    const zimma = list("wins3v3").entries.find((e) => e.tag === "#2GY22JUR")!;
    expect(zimma.name).toBe("Zimma");
    expect(zimma.href).toBe("/personer/zimma/");
    expect(zimma.inGameName).toBe("Zimma🏂");
    const ekstra = list("wins3v3").entries.find((e) => e.tag === "#RRCLPJVP")!;
    expect(ekstra.inGameName).toBeNull(); // same as the given name
    expect(list("wins3v3").entries[0].name).toBe("Ranked-spiller");
  });

  it("adds solo and duo for Showdown and leaves out zeros", () => {
    const sd = list("showdown").entries;
    expect(sd.map((e) => e.value)).toEqual([4480, 10]);
    expect(sd[0].detail).toBe("solo 2 303 · duo 2 177");
  });

  it("shows fame tier, and ranked rank with an old-system elo lowered", () => {
    expect(list("fame").entries[0].detail).toBe("Alien Fame I");
    // 9816 elo but only Masters I: counts as 8250.
    const r = list("ranked").entries[0];
    expect([r.value, r.detail, r.rankIcon]).toEqual([8250, "Masters I · justert fra 9 816", "masters"]);
  });

  it("knows the latest fetch", () => {
    expect(result.updatedAt).toBe("2026-11-26T04:11:00+00:00");
  });
});

describe("XP-nivå", () => {
  it("ranks by experience points and shows the level", () => {
    const result = buildToplists({
      ...base,
      stats: [
        stats("#2GY22JUR", { exp_level: 349, exp_points: 618581 }),
        stats("#9YRVPPGCC", { exp_level: 349, exp_points: 620000 }), // same level, more points
        stats("#RRCLPJVP", {}), // not fetched with the new columns yet: left out
      ],
    });
    const exp = result.lists.find((l) => l.key === "experience")!;
    expect(exp.entries.map((e) => e.tag)).toEqual(["#9YRVPPGCC", "#2GY22JUR"]);
    expect([exp.entries[1].display, exp.entries[1].detail]).toEqual(["349", "618\u00a0581 XP"]);
  });
});

describe("prettyName", () => {
  it("title-cases and keeps Roman numerals", () => {
    expect(prettyName("ALIEN FAME III")).toBe("Alien Fame III");
    expect(prettyName(null)).toBeNull();
  });
});

describe("fairRankedElo", () => {
  it("uses a manual correction for that tag before the rule", () => {
    expect(fairRankedElo(11642, 20, "#92GC0C9Q")).toBe(10083);
    expect(fairRankedElo(11642, 20, "#2GY22JUR")).toBe(9250);
  });

  it("lowers an elo that is above what the rank allows, to the start of that rank", () => {
    expect(fairRankedElo(9816, 19)).toBe(8250); // Masters I
    expect(fairRankedElo(9250, 19)).toBe(8250);
    expect(fairRankedElo(10300, 20)).toBe(9250); // Masters II
    expect(fairRankedElo(11632, 21)).toBe(10250); // Masters III
    expect(fairRankedElo(8755, 18)).toBe(7500); // Legendary III
    expect(fairRankedElo(8068, 17)).toBe(6750); // Legendary II
    expect(fairRankedElo(7023, 16)).toBe(6000); // Legendary I
    expect(fairRankedElo(6827, 14)).toBe(5000); // Mythic II
    expect(fairRankedElo(6000, 15)).toBe(5500); // Mythic III
    expect(fairRankedElo(4000, 11)).toBe(3500); // Diamond II
  });

  it("keeps elos that fit the rank, Pro, and ranks below Diamond", () => {
    expect(fairRankedElo(9249, 19)).toBe(9249);
    expect(fairRankedElo(10249, 20)).toBe(10249);
    expect(fairRankedElo(11632, 22)).toBe(11632); // Pro
    expect(fairRankedElo(8249, 18)).toBe(8249);
    expect(fairRankedElo(6749, 16)).toBe(6749);
    expect(fairRankedElo(4518, 13)).toBe(4518); // Mythic I, fits
    expect(fairRankedElo(3499, 10)).toBe(3499);
    expect(fairRankedElo(4000, 9)).toBe(4000); // Gold III: not covered by the rule
    expect(fairRankedElo(9500, null)).toBe(9500);
  });
});

describe("Maxet konto", () => {
  const brawler = (buffies: number, hypercharges = 1) => ({
    star_powers: 2,
    gadgets: 2,
    gears: 6,
    hypercharges,
    buffie_gadget: buffies > 0,
    buffie_star_power: buffies > 1,
    buffie_hypercharge: buffies > 2,
  });
  // Coins per brawler: level 11 = 15 245, 2 SP = 4 000, 2 gadgets = 2 000, 6 gears = 6 000,
  // hypercharge = 5 000, buffie = 5 000 each. 47 245 + 32 245 + 27 245 = 106 735 possible.
  const catalogue = [brawler(3), brawler(0), brawler(0, 0)];

  it("prices levels as coins + 2 x power points", () => {
    expect(levelCoins(1)).toBe(0);
    expect(levelCoins(2)).toBe(60);
    expect(levelCoins(9)).toBe(5910);
    expect(levelCoins(11)).toBe(3740 * 2 + 7765);
  });

  it("adds up the max coins per brawler", () => {
    expect(maxPoints(catalogue)).toBe(106735);
  });

  it("uses the stored level coins, else estimates them from the average level", () => {
    const row = (extra: Partial<StatsRow>) => ({ ...stats("#2GY22JUR"), brawlers_owned: 2, owned_levels: 20, ...extra });
    expect(ownedPoints(row({ owned_level_coins: 12345 }))).toBe(12345);
    expect(ownedPoints(row({}))).toBe(2 * levelCoins(10));
    expect(ownedPoints(row({ owned_levels: 21 }))).toBe(Math.round(2 * (levelCoins(10) + 0.5 * (levelCoins(11) - levelCoins(10)))));
    expect(ownedPoints(row({ owned_level_coins: 0, owned_buffies: 1, owned_gears: 2 }))).toBe(5000 + 2000);
  });

  it("scores owned points over every brawler, unowned ones as 0", () => {
    const result = buildToplists({
      ...base,
      catalogue,
      stats: [
        // Everything on all three brawlers: 100 %.
        stats("#2GY22JUR", {
          brawlers_owned: 3,
          owned_levels: 33,
          owned_star_powers: 6,
          owned_gadgets: 6,
          owned_gears: 18,
          owned_hypercharges: 2,
          owned_buffies: 3,
        }),
        // One brawler at level 11 only: 15 245 / 106 735.
        stats("#9YRVPPGCC", { brawlers_owned: 1, owned_levels: 11 }),
        // Not fetched with the new columns yet: left out.
        stats("#RRCLPJVP", { wins_3v3: 1 }),
      ],
    });
    const maxed = result.lists.find((l) => l.key === "maxed")!;
    expect(maxed.entries.map((e) => e.tag)).toEqual(["#2GY22JUR", "#9YRVPPGCC"]);
    expect(maxed.entries[0].display).toBe("100,0 %");
    expect(maxed.entries[1].value).toBeCloseTo((15245 / 106735) * 100);
    expect(maxed.entries[1].detail).toBe("1/3 brawlere");
    // 3 brawlers: 33 levels, 6 star powers, 6 gadgets, 18 gears, 2 hypercharges, 3 buffies.
    expect(maxed.entries[0].breakdown).toEqual([
      { label: "Brawlere", owned: 3, max: 3 },
      { label: "Nivåer", owned: 33, max: 33, coins: { spent: 45735, max: 45735 } },
      { label: "Star powers", owned: 6, max: 6, coins: { spent: 12000, max: 12000 } },
      { label: "Gadgets", owned: 6, max: 6, coins: { spent: 6000, max: 6000 } },
      { label: "Gears", owned: 18, max: 18, coins: { spent: 18000, max: 18000 } },
      { label: "Hypercharges", owned: 2, max: 2, coins: { spent: 10000, max: 10000 } },
      { label: "Buffies", owned: 3, max: 3, coins: { spent: 15000, max: 15000 } },
    ]);
    expect(maxed.entries[0].coins).toEqual({ spent: 106735, max: 106735 });
    expect(maxed.entries[1].breakdown![1]).toEqual({
      label: "Nivåer",
      owned: 11,
      max: 33,
      coins: { spent: 15245, max: 45735 },
    });
    expect(maxed.entries[1].coins).toEqual({ spent: 15245, max: 106735 });
    expect([result.brawlerCount, result.buffieBrawlers]).toEqual([3, 1]);
  });

  it("leaves out brawlers that can't be unlocked yet", () => {
    const withUnreleased = [...catalogue, { ...brawler(0), released: false }];
    expect(maxPoints(withUnreleased)).toBe(106735);
    const result = buildToplists({
      ...base,
      catalogue: withUnreleased,
      stats: [stats("#2GY22JUR", { brawlers_owned: 1, owned_levels: 11 })],
    });
    expect(result.lists.find((l) => l.key === "maxed")!.entries[0].detail).toBe("1/3 brawlere");
    expect(result.brawlerCount).toBe(3);
  });

  it("is empty before the catalogue exists", () => {
    const result = buildToplists({ ...base, stats: [stats("#2GY22JUR", { brawlers_owned: 1, owned_levels: 11 })] });
    expect(result.lists.find((l) => l.key === "maxed")!.entries).toEqual([]);
  });
});

describe("buildToplists with minis", () => {
  const result = buildToplists({
    ...base,
    minis: [
      { tag: "#8Q0YGP8P", name: "Zimma mini", main_tag: "#2GY22JUR" },
      { tag: "#2QJ8YV9YL", name: "Zimma #3", main_tag: "#2GY22JUR" },
      { tag: "#99J000", name: "No numbers", main_tag: "#2GY22JUR" }, // no stats row: left out
      { tag: "#RRCLPJVP", name: "Also extra", main_tag: "#2GY22JUR" }, // on the lists by itself already
    ],
    stats: [
      stats("#2GY22JUR", { wins_3v3: 100, wins_solo: 10, wins_duo: 5, fame: 500, exp_level: 300, exp_points: 1000 }),
      stats("#9YRVPPGCC", { wins_3v3: 150, fame: 100 }),
      stats("#RRCLPJVP", { wins_3v3: 1 }),
      stats("#8Q0YGP8P", { wins_3v3: 40, wins_solo: 1, wins_duo: 2, fame: 900, exp_level: 50, exp_points: 200 }),
      stats("#2QJ8YV9YL", { wins_3v3: 20, exp_level: 10, exp_points: 30 }),
    ],
  });
  const plain = (key: string) => result.lists.find((l) => l.key === key)!.entries;
  const withMinis = (key: string) => result.listsWithMinis.find((l) => l.key === key)!.entries;

  it("leaves minis out of the plain lists", () => {
    expect(plain("wins3v3").map((e) => e.tag)).toEqual(["#9YRVPPGCC", "#2GY22JUR", "#RRCLPJVP"]);
    expect(result.miniCount).toBe(2);
  });

  it("adds 3v3, Showdown and XP of the minis onto the main account", () => {
    const wins = withMinis("wins3v3");
    expect(wins.map((e) => [e.tag, e.value])).toEqual([
      ["#2GY22JUR", 160],
      ["#9YRVPPGCC", 150],
      ["#RRCLPJVP", 1],
    ]);
    expect(wins[0].detail).toBe("med 2 minis");
    const sd = withMinis("showdown").find((e) => e.tag === "#2GY22JUR")!;
    expect(sd.value).toBe(18);
    expect(sd.detail).toBe("solo 11 · duo 7 · med 2 minis");
    const xp = withMinis("experience").find((e) => e.tag === "#2GY22JUR")!;
    expect([xp.value, xp.display]).toEqual([1230, "360"]);
  });

  it("lists minis on their own for fame", () => {
    const fame = withMinis("fame");
    expect(fame.map((e) => e.tag)).toEqual(["#8Q0YGP8P", "#2GY22JUR", "#9YRVPPGCC"]);
    expect(fame[0].name).toBe("Zimma mini");
    expect(fame[0].miniOf).toBe("Zimma");
    expect(fame[1].miniOf).toBeNull();
  });
});
