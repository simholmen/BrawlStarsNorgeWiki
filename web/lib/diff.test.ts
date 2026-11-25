import { describe, expect, it } from "vitest";
import { diffLines } from "./diff";

describe("diffLines", () => {
  it("marks added and removed lines", () => {
    expect(diffLines("a\nb\nc", "a\nB\nc")).toEqual([
      { type: "same", text: "a" },
      { type: "del", text: "b" },
      { type: "add", text: "B" },
      { type: "same", text: "c" },
    ]);
  });

  it("collapses unchanged lines far from changes", () => {
    const old = ["1", "2", "3", "4", "5", "6", "7", "8"].join("\n");
    const neu = ["1", "2", "3", "4", "5", "6", "7", "X"].join("\n");
    expect(diffLines(old, neu, 1)).toEqual([
      { type: "gap", count: 6 },
      { type: "same", text: "7" },
      { type: "del", text: "8" },
      { type: "add", text: "X" },
    ]);
  });

  it("handles empty sides", () => {
    expect(diffLines("", "ny")).toEqual([
      { type: "del", text: "" },
      { type: "add", text: "ny" },
    ]);
    expect(diffLines("same", "same")).toEqual([{ type: "gap", count: 1 }]);
  });
});
