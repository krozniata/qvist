import { describe, expect, test } from "bun:test";
import { clip, wrap } from "../src/ui/text";

describe("clip", () => {
  test("cuts to the width with an ellipsis, only when it must", () => {
    expect(clip("src/app/main.ts", 8)).toBe("src/app…");
    expect(clip("short", 5)).toBe("short");
    expect(clip("żółw", 3)).toBe("żó…");
    expect(clip("any", 0)).toBe("");
  });
});

describe("wrap", () => {
  test("breaks at spaces and keeps the text's own line breaks", () => {
    expect(wrap("the quick brown fox", 10)).toEqual(["the quick", "brown fox"]);
    expect(wrap("one\n\ntwo", 10)).toEqual(["one", "", "two"]);
    expect(wrap("unbreakableword", 5)).toEqual(["unbreakableword"]);
  });
});
