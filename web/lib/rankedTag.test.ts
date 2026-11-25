import { describe, expect, it } from "vitest";
import { isValidTag, normalizeTag } from "./rankedTag";

describe("normalizeTag", () => {
  it("adds # and upper-cases", () => {
    expect(normalizeTag("2gy22jur")).toBe("#2GY22JUR");
  });
  it("strips spaces and extra #", () => {
    expect(normalizeTag("  # 2GY 22JUR ")).toBe("#2GY22JUR");
  });
  it("reads the letter O as zero", () => {
    expect(normalizeTag("r8rpoyou")).toBe("#R8RP0Y0U");
  });
});

describe("isValidTag", () => {
  it("accepts real tags", () => {
    expect(isValidTag("#2GY22JUR")).toBe(true);
    expect(isValidTag("#2C9UP928V")).toBe(true);
  });
  it("rejects characters tags never use", () => {
    expect(isValidTag("#ABC123")).toBe(false);
    expect(isValidTag("#99JOOO")).toBe(false);
  });
  it("rejects missing # and bad lengths", () => {
    expect(isValidTag("2GY22JUR")).toBe(false);
    expect(isValidTag("#2G")).toBe(false);
    expect(isValidTag("#")).toBe(false);
  });
});
