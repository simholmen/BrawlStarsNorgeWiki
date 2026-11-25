import { describe, expect, it } from "vitest";
import fixtures from "./slugify.fixtures.json";
import { imageKeyFor, slugify } from "./slugify";

describe("slugify", () => {
  it("reproduces every existing page's slug from its name", () => {
    expect(fixtures.length).toBe(46);
    for (const [name, slug] of fixtures as [string, string][]) {
      expect(slugify(name), name).toBe(slug);
    }
  });

  it("handles Norwegian letters, punctuation and spacing", () => {
    expect(slugify("Norske Brød")).toBe("norske-brød");
    expect(slugify("  Æsj -- Å/Ø!  ")).toBe("æsj-å-ø");
    expect(slugify("Chris-Daniel")).toBe("chris-daniel");
    expect(slugify("Zimma 2")).toBe("zimma-2");
    expect(slugify("!!!")).toBe("");
  });

  it("treats decomposed and composed ø the same", () => {
    expect(slugify("Bröd")).toBe(slugify("Bröd"));
  });
});

describe("imageKeyFor", () => {
  it("matches the Jekyll layout rule", () => {
    expect(imageKeyFor("Star Virus")).toBe("star_virus");
    expect(imageKeyFor("Norske Brød")).toBe("norske_brød");
  });
});
