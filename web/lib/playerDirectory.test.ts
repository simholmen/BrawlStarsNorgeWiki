import { describe, expect, it } from "vitest";
import { buildPlayerDirectory, matchesQuery, sortByOrder, whereIs, type ExtraRow, type RankedRow } from "./playerDirectory";

function ranked(tag: string, name: string, over: Partial<RankedRow> = {}): RankedRow {
  return {
    tag,
    name,
    active: true,
    main_tag: null,
    created_at: "2026-01-01T00:00:00Z",
    created_by_name: "Eddie",
    updated_at: "2026-01-01T00:00:00Z",
    updated_by_name: null,
    ...over,
  };
}

function extra(tag: string, name: string, over: Partial<ExtraRow> = {}): ExtraRow {
  return {
    tag,
    name,
    active: true,
    created_at: "2026-02-01T00:00:00Z",
    created_by_name: "Frida",
    updated_at: "2026-02-01T00:00:00Z",
    updated_by_name: null,
    ...over,
  };
}

const directory = buildPlayerDirectory({
  people: [
    { slug: "zimma", name: "Zimma", bsid: "2gy22jur", created_at: "2025-06-01T00:00:00Z" },
    { slug: "uten-tag", name: "Uten tag", bsid: null, created_at: "2025-06-01T00:00:00Z" },
  ],
  ranked: [
    ranked("#2GY22JUR", "Zimma ranked"),
    ranked("#8Q0YGP8P", "Zimma mini", { main_tag: "#2GY22JUR" }),
    ranked("#9YRVPPGCC", "Bare ranked", { created_at: "2026-03-01T00:00:00Z" }),
    ranked("#R8RP0Y0U", "Borte", { active: false, updated_at: "2026-04-01T00:00:00Z", updated_by_name: "Eddie" }),
    ranked("#QLYV0LPQ", "Borte mini", { active: false, main_tag: "#2GY22JUR" }),
  ],
  extras: [
    extra("#RRCLPJVP", "Ekstra"),
    extra("#2GY22JUR", "Zimma igjen"),
    extra("#9YRVPPGCC", "Promotert", { active: false }),
    extra("#YRJ2GCJ89", "Fjernet ekstra", { active: false }),
  ],
});
const by = (tag: string) => directory.players.find((p) => p.tag === tag)!;

describe("buildPlayerDirectory", () => {
  it("has one row per tag with every source, named wiki first", () => {
    expect(directory.players.map((p) => p.tag)).toEqual(["#9YRVPPGCC", "#RRCLPJVP", "#2GY22JUR"]);
    expect(by("#2GY22JUR")).toMatchObject({
      name: "Zimma",
      sources: ["wiki", "ranked", "topplister"],
      wiki: { slug: "zimma", name: "Zimma" },
      ranked: { name: "Zimma ranked" },
      extra: { name: "Zimma igjen" },
    });
    expect(by("#RRCLPJVP").sources).toEqual(["topplister"]);
  });

  it("puts minis under their main, not as rows of their own", () => {
    expect(by("#2GY22JUR").minis.map((m) => m.tag)).toEqual(["#8Q0YGP8P"]);
    expect(directory.players.some((p) => p.tag === "#8Q0YGP8P")).toBe(false);
  });

  it("dates a row by its newest source", () => {
    expect(by("#2GY22JUR")).toMatchObject({ created_at: "2026-02-01T00:00:00Z", created_by_name: "Frida" });
    expect(sortByOrder(directory.players, "newest").map((p) => p.tag)[0]).toBe("#9YRVPPGCC");
  });

  it("lists removed players only when they aren't on the site some other way", () => {
    expect(directory.removed.map((r) => [r.tag, r.source, r.miniOf])).toEqual([
      ["#R8RP0Y0U", "ranked", null],
      ["#QLYV0LPQ", "ranked", "Zimma ranked"],
      ["#YRJ2GCJ89", "topplister", null],
    ]);
    expect(directory.removed[0]).toMatchObject({ removed_at: "2026-04-01T00:00:00Z", removed_by_name: "Eddie" });
  });
});

describe("whereIs", () => {
  it("names every place a tag is on the site", () => {
    expect(whereIs(directory, "#2GY22JUR")).toBe("wiki-siden til Zimma og ranked-profilen Zimma ranked og topplistene");
    expect(whereIs(directory, "#8Q0YGP8P")).toBe("mini-konto av Zimma");
    expect(whereIs(directory, "#R8RP0Y0U")).toBeNull();
  });
});

describe("matchesQuery", () => {
  it("finds by name, tag without #, other names and minis", () => {
    expect(matchesQuery(by("#2GY22JUR"), "2gy22")).toBe(true);
    expect(matchesQuery(by("#2GY22JUR"), "#2GY22")).toBe(true);
    expect(matchesQuery(by("#2GY22JUR"), "igjen")).toBe(true);
    expect(matchesQuery(by("#2GY22JUR"), "8q0y")).toBe(true);
    expect(matchesQuery(by("#RRCLPJVP"), "zimma")).toBe(false);
  });
});
