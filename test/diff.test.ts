import { describe, expect, test } from "bun:test";
import { buildDiff, type Row } from "../src/model/diff";

const patch = `diff --git a/greet.ts b/greet.ts
index 1111111..2222222 100644
--- a/greet.ts
+++ b/greet.ts
@@ -1,4 +1,4 @@ export function greet() {
 const a = 1;
-const name = "world";
+const name = "Rex";
 const b = 2;
 const c = 3;
`;

const text = (r: Row) => (r.kind === "line" ? r.spans.map((s) => s.text).join("") : "");

describe("buildDiff", () => {
  test("numbers each line on the side it belongs to", async () => {
    const d = await buildDiff("greet.ts", patch);
    expect([d.added, d.removed, d.hunks]).toEqual([1, 1, 1]);
    const lines = d.unified.filter((r) => r.kind === "line");
    expect(lines.map((r) => r.kind === "line" && [r.type, r.old, r.new])).toEqual([
      ["context", 1, 1],
      ["del", 2, 0],
      ["add", 0, 2],
      ["context", 3, 3],
      ["context", 4, 4],
    ]);
    expect(lines.map(text)).toEqual(["const a = 1;", 'const name = "world";', 'const name = "Rex";', "const b = 2;", "const c = 3;"]);
  });

  test("opens each hunk with its context", async () => {
    const [hunk] = (await buildDiff("greet.ts", patch)).unified;
    expect(hunk).toEqual({ kind: "hunk", hunk: 0, collapsed: 0, context: "export function greet() {" });
  });

  test("pairs a deletion with its addition in the split view", async () => {
    const d = await buildDiff("greet.ts", patch);
    const changed = d.split.find((r) => r.kind === "split" && r.left?.type === "del");
    expect(changed?.kind === "split" && [changed.left?.no, changed.right?.type, changed.right?.no]).toEqual([2, "add", 2]);
  });

  test("marks only the changed word, and colours the code", async () => {
    const d = await buildDiff("greet.ts", patch);
    const add = d.unified.find((r) => r.kind === "line" && r.type === "add");
    const spans = add?.kind === "line" ? add.spans : [];
    expect(spans.filter((s) => s.em).map((s) => s.text).join("")).toContain("Rex");
    expect(spans.filter((s) => s.em).map((s) => s.text).join("")).not.toContain("const");
    expect(spans.some((s) => s.dark && s.light)).toBe(true);
  });

  test("leaves a side empty where only one side has lines", async () => {
    const d = await buildDiff("a.txt", "--- a/a.txt\n+++ b/a.txt\n@@ -1 +1,2 @@\n one\n+two\n");
    const added = d.split.at(-1);
    expect(added?.kind === "split" && [added.left, added.right?.no]).toEqual([null, 2]);
  });

  test("shows a binary file as binary, and an empty patch as nothing", async () => {
    expect((await buildDiff("a.png", "Binary files a/a.png and b/a.png differ\n")).binary).toBe(true);
    expect((await buildDiff("a.txt", "")).unified).toEqual([]);
  });
});
