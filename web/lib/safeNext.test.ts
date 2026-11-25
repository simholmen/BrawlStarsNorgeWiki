import { describe, expect, it } from "vitest";
import { safeNext } from "./safeNext";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/konto/")).toBe("/konto/");
    expect(safeNext("/personer/zimma/?x=1#a")).toBe("/personer/zimma/?x=1#a");
  });

  it("falls back for missing or external targets", () => {
    expect(safeNext(null)).toBe("/konto/");
    expect(safeNext("")).toBe("/konto/");
    expect(safeNext("https://evil.example/")).toBe("/konto/");
    expect(safeNext("//evil.example/")).toBe("/konto/");
    expect(safeNext("/\\evil.example")).toBe("/konto/");
    expect(safeNext("javascript:alert(1)")).toBe("/konto/");
    expect(safeNext("/ok\r\nSet-Cookie: x")).toBe("/konto/");
  });

  it("uses a custom fallback", () => {
    expect(safeNext("https://x", "/wiki/")).toBe("/wiki/");
  });
});
