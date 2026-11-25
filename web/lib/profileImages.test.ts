import { describe, expect, it } from "vitest";
import { legacyPortrait, profileImages } from "./profileImages";
import { validateChanges } from "./fields";

const UP = "https://abc.supabase.co/storage/v1/object/public/wiki-images/2026-11/3f2c1a9e-1b2c-4d3e-8f90-123456789abc.png";

describe("legacyPortrait", () => {
  it("uses the old folders", () => {
    expect(legacyPortrait("person", "zimma", "jpg")).toBe("/images/profilbilde/zimma.jpg");
    expect(legacyPortrait("club", "ta", "png")).toBe("/images/klubber/klubb_profilbilde/ta.png");
  });
});

describe("profileImages", () => {
  it("lists old files by year when nothing is uploaded", () => {
    expect(profileImages("person", "z", {}).map((p) => [p.year, p.src])).toEqual([
      [2024, "/images/bsProfiler2024/z_profil.jpg"],
      [2025, "/images/bsProfiler2025/z.png"],
      [2026, "/images/bsProfiler2026/z.png"],
    ]);
    expect(profileImages("club", "c", {}).map((p) => p.src)).toEqual(["/images/klubber/klubbprofil/c.png"]);
  });

  it("lets uploads replace a year and add new years, sorted", () => {
    const list = profileImages("club", "c", { "2025": UP, "2027": UP, "2023": UP });
    expect(list.map((p) => [p.year, p.uploaded])).toEqual([
      [2023, true],
      [2025, true],
      [2027, true],
    ]);
    expect(list[1]).toMatchObject({ src: UP, when: "2025" });
  });

  it("drops hidden years and what keep rejects", () => {
    const list = profileImages("person", "z", { "2026": UP }, [2024], (src) => src !== "/images/bsProfiler2025/z.png");
    expect(list.map((p) => p.year)).toEqual([2026]);
  });
});

describe("validateChanges for uploaded images", () => {
  it("accepts bucket URLs and null", () => {
    expect(validateChanges("person", { portrait_url: UP, profile_urls: { "2026": UP } })).toEqual({
      ok: true,
      values: { portrait_url: UP, profile_urls: { "2026": UP } },
    });
    expect(validateChanges("club", { portrait_url: null }).ok).toBe(true);
  });

  it("rejects other URLs, bad years and wrong shapes", () => {
    expect(validateChanges("person", { portrait_url: "https://evil.example/x.png" }).ok).toBe(false);
    expect(validateChanges("person", { profile_urls: { "1999": UP } }).ok).toBe(false);
    expect(validateChanges("person", { profile_urls: { "2026": "/images/x.png" } }).ok).toBe(false);
    expect(validateChanges("person", { profile_urls: [UP] }).ok).toBe(false);
  });
});
