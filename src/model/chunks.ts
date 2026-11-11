// Colouring a big diff a piece at a time. The diff is built first without
// colours, which is quick, and then each piece of it is coloured on its own:
// a few hundred lines of the patch, led into by some lines before them so the
// highlighter starts where a comment or a string may already be open. The
// pieces' colours are then put on the rows they belong to.
import { buildDiff, type Diff, type Span } from "./diff";

// How many rows a piece colours, how far a piece may run on to end between
// changes, and how many lines come before it to prime the highlighter.
const size = 200, runOn = 400, lead = 80;

type Hunk = { header: string; lines: string[]; counted: number[] };
export type Chunk = { patch: string; rows: number[] };
export type Coloured = { rows: number[]; spans: Span[][] };

const headerOf = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

// parse splits a patch into the lines before its hunks and the hunks. A line
// is a row when it adds, removes or keeps a line of the file; the rest, such
// as "\ No newline at end of file", ride along with the line before.
function parse(patch: string): { head: string[]; hunks: Hunk[] } {
  const lines = patch.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  const head: string[] = [], hunks: Hunk[] = [];
  for (const l of lines) {
    if (l.startsWith("@@")) hunks.push({ header: l, lines: [], counted: [] });
    else if (hunks.length === 0) head.push(l);
    else {
      const h = hunks[hunks.length - 1];
      if (l[0] === " " || l[0] === "-" || l[0] === "+") h.counted.push(h.lines.length);
      h.lines.push(l);
    }
  }
  return { head, hunks };
}

// planChunks cuts a patch into pieces to colour, each with the row of the
// uncoloured diff every one of its rows belongs to (-1 for those that only
// lead in). It answers null when the patch doesn't line up with the rows, and
// the diff should then be coloured whole.
export function planChunks(patch: string, plain: Diff): Chunk[] | null {
  const { head, hunks } = parse(patch);
  const chunks: Chunk[] = [];
  const push = (body: string[], rows: number[]) => chunks.push({ patch: [...head, ...body].join("\n") + "\n", rows });
  let group: string[] = [], groupRows: number[] = [], groupCount = 0;
  const flush = () => {
    if (group.length === 0) return;
    push(group, groupRows);
    [group, groupRows, groupCount] = [[], [], 0];
  };
  let row = 0;
  for (const h of hunks) {
    const base = row, n = h.counted.length;
    row += 1 + n;
    if (n <= size) {
      group.push(h.header, ...h.lines);
      groupRows.push(-1, ...h.counted.map((_, j) => base + 1 + j));
      groupCount += n;
      if (groupCount >= size) flush();
      continue;
    }
    flush();
    const m = headerOf.exec(h.header);
    if (!m) return null;
    // How many old and new lines come before each row.
    const oldAt = [0], newAt = [0];
    for (const i of h.counted) {
      const c = h.lines[i][0];
      oldAt.push(oldAt[oldAt.length - 1] + (c === "+" ? 0 : 1));
      newAt.push(newAt[newAt.length - 1] + (c === "-" ? 0 : 1));
    }
    for (let s = 0, e = 0; s < n; s = e) {
      // A piece ends before a line that is kept, so a change isn't cut in two.
      e = Math.min(s + size, n);
      while (e < n && h.lines[h.counted[e]][0] !== " " && e < s + size + runOn) e++;
      const from = Math.max(0, s - lead);
      const body = h.lines.slice(h.counted[from], e < n ? h.counted[e] : h.lines.length);
      const header = `@@ -${+m[1] + oldAt[from]},${oldAt[e] - oldAt[from]} +${+m[3] + newAt[from]},${newAt[e] - newAt[from]} @@${m[5]}`;
      const rows = [-1, ...Array<number>(s - from).fill(-1), ...Array.from({ length: e - s }, (_, j) => base + 1 + s + j)];
      push([header, ...body], rows);
    }
  }
  flush();
  return row === plain.unified.length ? chunks : null;
}

// orderChunks puts the pieces by how near they are to the first change, which
// is where a diff opens: that one, the next, the one before, and so on out.
export function orderChunks(chunks: Chunk[], plain: Diff): Chunk[] {
  const first = Math.max(0, plain.unified.findIndex((r) => r.kind === "line" && r.type !== "context"));
  const at = Math.max(0, chunks.findIndex((c) => c.rows[c.rows.length - 1] >= first));
  const out: Chunk[] = [];
  for (let d = 0; out.length < chunks.length; d++) {
    if (chunks[at + d]) out.push(chunks[at + d]);
    if (d > 0 && chunks[at - d]) out.push(chunks[at - d]);
  }
  return out;
}

// colourChunk builds one piece with its colours and answers the spans of the
// rows it covers, or null when it came out a different shape than planned.
export async function colourChunk(path: string, c: Chunk, words?: boolean): Promise<Coloured | null> {
  const sub = await buildDiff(path, c.patch, false, words);
  if (sub.unified.length !== c.rows.length) return null;
  const out: Coloured = { rows: [], spans: [] };
  sub.unified.forEach((r, i) => {
    if (c.rows[i] >= 0 && r.kind === "line") {
      out.rows.push(c.rows[i]);
      out.spans.push(r.spans);
    }
  });
  return out;
}

// paint puts a piece's colours on the rows of the diff, in place: the split
// rows share the unified rows' spans, so both views take them.
export function paint(d: Diff, c: Coloured): void {
  c.rows.forEach((row, i) => {
    const r = d.unified[row];
    if (r?.kind === "line") r.spans.splice(0, r.spans.length, ...c.spans[i]);
  });
}
