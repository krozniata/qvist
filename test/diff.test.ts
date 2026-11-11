import { describe, expect, test } from "bun:test";
import { colourChunk, orderChunks, paint, planChunks } from "../src/model/chunks";
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

describe("colouring in pieces", () => {
  // A long single hunk, as a new file or the whole file shown, with changes
  // spread through it and a block comment in the middle.
  const long = (n: number) => {
    let p = `diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -1,${n} +1,${n} @@\n`;
    for (let i = 0; i < n; i++) p += i % 50 === 7 ? `-const v${i} = f(${i}, "old");\n+const v${i} = f(${i}, "new");\n` : ` const v${i} = f(${i}, "same");\n`;
    return p;
  };

  test("gives the rows and colours of colouring the whole file", async () => {
    const p = long(900);
    const [whole, plain] = [await buildDiff("x.ts", p), await buildDiff("x.ts", p, true)];
    const chunks = planChunks(p, plain);
    expect(chunks!.length).toBeGreaterThan(3);
    for (const c of orderChunks(chunks!, plain)) paint(plain, (await colourChunk("x.ts", c))!);
    expect(plain.unified).toEqual(whole.unified);
    expect(plain.split).toEqual(whole.split);
  });

  test("starts at the piece with the first change and moves outward", async () => {
    const p = long(900);
    const plain = await buildDiff("x.ts", p, true);
    const chunks = planChunks(p, plain)!;
    const first = plain.unified.findIndex((r) => r.kind === "line" && r.type !== "context");
    const order = orderChunks(chunks, plain);
    expect(order[0].rows.includes(first)).toBe(true);
    expect(order).toHaveLength(chunks.length);
  });

  test("plans nothing for a patch that doesn't line up with its rows", async () => {
    const p = long(300);
    const plain = await buildDiff("x.ts", p, true);
    expect(planChunks(p + "@@ -1 +1 @@\n-a\n+b\n", plain)).toBeNull();
  });

  test("handles many small hunks grouped into pieces", async () => {
    let p = "diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n";
    for (let h = 0; h < 60; h++) p += `@@ -${h * 40 + 1},5 +${h * 40 + 1},5 @@ fn${h}\n const a${h} = 1;\n-const b${h} = 2;\n+const b${h} = 3;\n const c${h} = 4;\n const d${h} = 5;\n`;
    const [whole, plain] = [await buildDiff("x.ts", p), await buildDiff("x.ts", p, true)];
    const chunks = planChunks(p, plain)!;
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of orderChunks(chunks, plain)) paint(plain, (await colourChunk("x.ts", c))!);
    expect(plain.unified).toEqual(whole.unified);
  });
});
