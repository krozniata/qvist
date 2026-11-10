// The Config tab: the scopes over one card of settings by section.
import { type App, type ConfigRow, scopes } from "../app/app";
import { card } from "../ui/frame";
import { blank, Line, row } from "../ui/line";
import { tileList } from "../ui/list";
import { segmented } from "../ui/segmented";
import { clip, width } from "../ui/text";
import { bodyRows, bodyCols } from "./common";

export function config(a: App): string[] {
  const t = a.theme, cols = bodyCols(a), rows = bodyRows(a), inner = cols - 2;
  const e = a.configEntry();
  const bar = row(inner, t.sidebar, null, (l) => {
    // The bar is the card's first row (screen row 2), past the margin, the
    // card's padding and the row's inset (column 3); clicks find the pills here.
    a.scopeSpans = segmented(l, t, scopes.map((sc) => ({ label: sc === "local" ? "Repository" : sc[0].toUpperCase() + sc.slice(1), on: sc === a.scope, disabled: sc === "local" && !a.repo })), 3);
    a.scopeRow = 2;
    return e ? l.right(`${clip(e.origin, 40)} `, t.tertiary) : l;
  });
  const out: Line[] = [bar, blank(inner, t.sidebar)];
  const keyCols = Math.min(28, Math.max(14, ...a.configRows.map((r) => (r.kind === "entry" ? width(r.entry.name) + 2 : 0))));
  const list = tileList<ConfigRow>({
    items: a.configRows,
    selected: a.csel,
    top: a.ctop,
    follow: a.follow,
    rows: rows - 2 - out.length,
    cols: inner,
    base: t.sidebar,
    fill: t.selected,
    at: [2 + out.length, 2],
    tile: (r) => r.kind === "entry",
    hit: (screen, i) => a.rowMap.set(screen, i),
    draw: (l, r, _i, on) => {
      if (r.kind === "section") return l.add(" " + r.name, t.accent, { bold: true });
      const en = r.entry;
      l.add("   " + clip(en.name, keyCols).padEnd(keyCols), t.secondary).add(clip(en.value, l.left - 30), t.content, { bold: on });
      return en.overriddenBy ? l.right(`overridden by ${en.overriddenBy} `, t.warning) : l;
    },
  });
  a.ctop = list.top;
  out.push(...list.lines);
  if (a.configRows.length === 0) out[2] = row(inner, t.sidebar, null, (l) => l.add(` No ${a.scope === "local" ? "repository" : a.scope} settings yet — press n to add one`, t.tertiary));
  return card(out, cols, rows, t.sidebar, t.canvas, [1, 1]);
}
