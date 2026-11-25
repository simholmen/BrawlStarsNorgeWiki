import { describe, expect, it } from "vitest";
import { filterEntities, findLinkQuery, insertLink, type WikiEntity } from "./linkPicker";

const all: WikiEntity[] = [
  { kind: "person", slug: "zimma", name: "Zimma" },
  { kind: "person", slug: "zimmas-mini", name: "Zimmas mini" },
  { kind: "person", slug: "midnight-zephyr", name: "Midnight Zephyr" },
  { kind: "klubb", slug: "midnight-zephyr", name: "Midnight Zephyr" },
  { kind: "klubb", slug: "norske-brød", name: "Norske Brød" },
];

describe("findLinkQuery", () => {
  it("finds an open [[ before the caret", () => {
    expect(findLinkQuery("Bror til [[cur", 14)).toEqual({ start: 9, query: "cur" });
    expect(findLinkQuery("[[", 2)).toEqual({ start: 0, query: "" });
  });
  it("ignores finished links, new lines and the label part", () => {
    expect(findLinkQuery("[[person:x|X]] og", 17)).toBeNull();
    expect(findLinkQuery("[[ab\ncd", 7)).toBeNull();
    expect(findLinkQuery("[[person:x|La", 13)).toBeNull();
    expect(findLinkQuery("ingen lenke", 5)).toBeNull();
  });
});

describe("insertLink", () => {
  it("replaces the query with a full link and moves the caret after it", () => {
    const r = insertLink("Bror til [[cur og mer", 9, 14, { kind: "person", slug: "cursed", name: "Cursed" });
    expect(r.text).toBe("Bror til [[person:cursed|Cursed]] og mer");
    expect(r.caret).toBe("Bror til [[person:cursed|Cursed]]".length);
  });
});

describe("filterEntities", () => {
  it("ranks prefix matches first, people before clubs", () => {
    expect(filterEntities(all, "zim").map((e) => e.slug)).toEqual(["zimma", "zimmas-mini"]);
    expect(filterEntities(all, "mid").map((e) => e.kind)).toEqual(["person", "klubb"]);
    expect(filterEntities(all, "brød").map((e) => e.slug)).toEqual(["norske-brød"]);
    expect(filterEntities(all, "BRØD")).toHaveLength(1);
    expect(filterEntities(all, "xyz")).toEqual([]);
  });
});
