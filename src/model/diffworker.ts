// The worker that builds diffs, so highlighting a big file never holds up the
// screen. A small patch comes back whole. A big one comes back at once
// without colours, then its pieces are coloured one at a time, those near the
// first change first, and a newer request cuts the rest short.
import { colourChunk, orderChunks, planChunks } from "./chunks";
import { buildDiff, warmUp, wordsFor } from "./diff";

declare var self: Worker;

// A patch up to this many characters is quick enough to colour whole.
const smallPatch = 10_000;

// Loading the grammars isn't all the first diff costs: it also sets the
// highlighter up for its first use, half a second more. A small diff built
// here, each way, does that before anything waits for it.
const sample = "--- a/a.ts\n+++ b/a.ts\n@@ -1 +1,2 @@\n const a = 1;\n+const b = 2;\n";
let primed = false;
const loaded = warmUp();
loaded
  .then(() => buildDiff("a.ts", sample, true))
  .then(() => buildDiff("a.ts", sample))
  .catch(() => {})
  .then(() => void (primed = true));

let current = -1;

self.onmessage = async (e: MessageEvent<{ id: number; path: string; patch: string }>) => {
  const { id, path, patch } = e.data;
  current = id;
  try {
    // Until it is primed, rows without colours come first whatever the size,
    // since they don't wait on the highlighter's set-up.
    await loaded;
    if (current !== id) return;
    const whole = async () => self.postMessage({ id, kind: "diff", diff: await buildDiff(path, patch), complete: true });
    if (primed && patch.length <= smallPatch) return whole();
    const plain = await buildDiff(path, patch, true);
    const chunks = planChunks(patch, plain);
    if (current !== id) return;
    if (!chunks) return whole();
    self.postMessage({ id, kind: "diff", diff: plain, complete: false });
    const words = wordsFor(patch);
    for (const c of orderChunks(chunks, plain)) {
      // Let a newer request in between pieces.
      await Bun.sleep(0);
      if (current !== id) return;
      const done = await colourChunk(path, c, words);
      if (current !== id) return;
      if (done) self.postMessage({ id, kind: "spans", ...done });
    }
    self.postMessage({ id, kind: "done" });
  } catch (err) {
    self.postMessage({ id, kind: "error", error: err instanceof Error ? err.message : String(err) });
  }
};
