import { describe, expect, it } from "vitest";
import { validateChanges } from "./fields";

describe("validateChanges", () => {
  it("trims text, turns empty into null and normalizes bsid", () => {
    const r = validateChanges("person", { quote: "  Hei  ", hjemsted: "  ", bsid: "#ab12 cd" });
    expect(r).toEqual({ ok: true, values: { quote: "Hei", hjemsted: null, bsid: "AB12CD" } });
  });

  it("rejects fields that may not be edited", () => {
    for (const key of ["slug", "id", "image_key", "updated_at", "underklubber"]) {
      expect(validateChanges("person", { [key]: "x" }).ok, key).toBe(false);
    }
    expect(validateChanges("club", { hidden_profile_years: [2024] }).ok).toBe(false);
  });

  it("enforces required name and length limits", () => {
    expect(validateChanges("person", { name: "   " }).ok).toBe(false);
    expect(validateChanges("person", { quote: "x".repeat(301) }).ok).toBe(false);
    expect(validateChanges("person", { quote: "x".repeat(300) }).ok).toBe(true);
    expect(validateChanges("person", { body_md: "x".repeat(50_001) }).ok).toBe(false);
    expect(validateChanges("person", { bsid: "ÆØÅ" }).ok).toBe(false);
  });

  it("cleans facts: drops empty rows, needs a label", () => {
    expect(
      validateChanges("person", {
        facts: [
          { label: " Familie ", value: " [[person:cursed|Cursed]] " },
          { label: "", value: "" },
        ],
      }),
    ).toEqual({ ok: true, values: { facts: [{ label: "Familie", value: "[[person:cursed|Cursed]]" }] } });
    expect(validateChanges("person", { facts: [{ label: "", value: "x" }] }).ok).toBe(false);
    expect(validateChanges("person", { facts: "nope" }).ok).toBe(false);
  });

  it("checks lists, years and image format", () => {
    expect(validateChanges("club", { underklubber: [" MZ 2 ", "", "AZ"] })).toEqual({
      ok: true,
      values: { underklubber: ["MZ 2", "AZ"] },
    });
    expect(validateChanges("person", { hidden_profile_years: [2026, 2024, 2024] })).toEqual({
      ok: true,
      values: { hidden_profile_years: [2024, 2026] },
    });
    expect(validateChanges("person", { hidden_profile_years: [1999] }).ok).toBe(false);
    expect(validateChanges("person", { image_ext: "exe" }).ok).toBe(false);
    expect(validateChanges("person", { body_md: "a\r\nb" })).toEqual({ ok: true, values: { body_md: "a\nb" } });
  });
});
