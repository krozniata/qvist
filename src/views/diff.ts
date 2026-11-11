// The diff, in Pierre's layout: a bar with the file, then its lines, unified
// or split.
import type { App } from "../app/app";
import type { Row, Side, Span } from "../model/diff";
import { fileIcon } from "../ui/icons";
import type { RGB } from "../theme";
import { blank, Joined, Line, Padded, Rounded } from "../ui/line";
import { clip, width } from "../ui/text";

const gutter = 6;

// diffPane draws the diff `outer` columns wide, inset two columns.
export function diffPane(a: App, outer: number, height: number): Line[] {
  return diffLines(a, outer - 4, height).map((l) => new Padded(l, a.theme.surface, 2));
}

// centered fills height rows with one message in their middle.
function centered(cols: number, height: number, base: RGB, msg: string, color: RGB): Line[] {
  return Array.from({ length: height }, (_, i) => {
    const l = blank(cols, base);
    return i === Math.trunc(height / 2) - 1 ? l.pad(Math.trunc((cols - width(msg)) / 2)).add(msg, color) : l;
  });
}

function diffLines(a: App, cols: number, height: number): Line[] {
  const t = a.theme, d = a.diff, out: Line[] = [];
  if (a.diffSlow) return centered(cols, height, t.surface, "Loading…", t.tertiary);
  const c = a.tab === "changes" ? a.current() : null;
  if (!d || (a.tab === "changes" && !c)) {
    const msg = a.repo ? (a.items.length <= 1 ? "Nothing to commit, working tree clean" : "Select a file to see its changes") : "Not a git repository";
    return centered(cols, height, t.surface, msg, t.tertiary);
  }
  const [icon, tone] = fileIcon(d.path, t);
  // The path takes the accent while the diff has focus.
  const bar = new Line(cols, t.surface).add(icon + " ", tone).add(clip(d.path, cols - 30), a.focus === "diff" ? t.accent : t.content, { bold: true });
  if (c?.staged) bar.add("  staged", t.tertiary);
  const mode = a.split ? "split" : "unified";
  bar.pad(bar.left - width(`+${d.added} −${d.removed} `) - width(mode) - 3);
  bar.add(`+${d.added} `, t.success).add(`−${d.removed} `, t.danger).pill(mode, t.secondary, t.raised);
  out.push(bar, blank(cols, t.surface));
  if (d.binary) out.push(new Line(cols, t.surface).add(" Binary file not shown", t.tertiary));
  const rows = a.rows();
  // Scrolling sideways stops when the longest line's end reaches the edge.
  const wide = widest(rows);
  const longest = Math.max(0, wide.unified + gutter * 2 + 6 - cols, wide.side + gutter + 6 - Math.trunc(cols / 2));
  a.diffLeft = Math.max(0, Math.min(a.diffLeft, longest));
  for (let i = a.diffTop; out.length < height; i++) {
    const r = rows[i];
    if (!r) {
      out.push(blank(cols, t.surface));
      continue;
    }
    // The whole file has no lines left to fold, so no separator.
    if (r.kind === "hunk" && a.full) continue;
    if (r.kind === "hunk" && i > a.diffTop) out.push(blank(cols, t.surface));
    if (out.length < height) out.push(diffRow(a, r, cols));
    if (r.kind === "hunk" && out.length < height) out.push(blank(cols, t.surface));
  }
  return out;
}

const spansWidth = (spans: Span[]) => spans.reduce((n, sp) => n + width(sp.text), 0);

// widest is the width of the longest line of code in rows, as a whole line
// and as one side of a split; worked out once per diff, not per frame.
const widths = new WeakMap<Row[], { unified: number; side: number }>();
function widest(rows: Row[]): { unified: number; side: number } {
  let w = widths.get(rows);
  if (w) return w;
  w = { unified: 0, side: 0 };
  for (const r of rows) {
    if (r.kind === "line") w.unified = Math.max(w.unified, spansWidth(r.spans));
    else if (r.kind === "split") for (const s of [r.left, r.right]) if (s) w.side = Math.max(w.side, spansWidth(s.spans));
  }
  widths.set(rows, w);
  return w;
}

function diffRow(a: App, r: Row, cols: number): Line {
  const t = a.theme;
  if (r.kind === "hunk") {
    const l = new Line(cols - 2, t.surface).add(r.collapsed > 0 ? `⋯ ${r.collapsed} unmodified line${r.collapsed === 1 ? "" : "s"}` : "⋯", t.tertiary);
    if (r.context) l.add("   " + r.context.trim(), t.tertiary);
    return new Rounded(l, t.surface);
  }
  if (r.kind === "line") return codeLine(a, cols, r.type, [r.old ? String(r.old) : "", r.new ? String(r.new) : ""], r.spans);
  const half = Math.trunc(cols / 2);
  return new Joined(side(a, half, r.left), side(a, cols - half, r.right));
}

function side(a: App, cols: number, s: Side | null): Line {
  return s ? codeLine(a, cols, s.type, [String(s.no)], s.spans) : blank(cols, a.theme.surface);
}

// codeLine draws one line of code: a coloured bar, the line numbers, then
// Pierre's tokens on the line's tint, changed words on a stronger one,
// scrolled sideways by diffLeft.
function codeLine(a: App, cols: number, type: "context" | "add" | "del", numbers: string[], spans: Span[]): Line {
  const t = a.theme;
  const tint = type === "add" ? t.addBg : type === "del" ? t.delBg : t.surface;
  const emph = type === "add" ? t.addEmphasis : type === "del" ? t.delEmphasis : t.surface;
  const mark = type === "add" ? t.success : type === "del" ? t.danger : t.surface;
  // Unchanged lines have no bar: a block in the clear fill would show as ink.
  const l = new Line(cols, tint).add(type === "context" ? " " : "▌", mark);
  for (const n of numbers) l.add(n.padStart(gutter - 1) + " ", type === "context" ? t.tertiary : mark);
  l.add(type === "add" ? "  +  " : type === "del" ? "  -  " : "     ", mark);
  let skip = a.diffLeft;
  for (const sp of spans) {
    let text = sp.text;
    if (skip > 0) {
      const n = Math.min(skip, width(text));
      text = [...text].slice(n).join("");
      skip -= n;
    }
    if (text !== "") l.add(text, (t.dark ? sp.dark : sp.light) ?? t.content, { bg: sp.em ? emph : tint });
  }
  return l;
}
