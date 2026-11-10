// The History tab: a Git Graph table over the chosen commit's files and diff.
import type { App } from "../app/app";
import { layoutOf } from "../app/layout";
import type * as git from "../git";
import { type Graph, layoutGraph } from "../model/graph";
import { branchIcon } from "../ui/icons";
import { drawGraph } from "../ui/picture";
import { mix, type RGB } from "../theme";
import * as frame from "../ui/frame";
import { card } from "../ui/frame";
import { blank, Line, row } from "../ui/line";
import { sectionHeader, tileList } from "../ui/list";
import { clip, width, wrap } from "../ui/text";
import { beside, bodyCols, bodyRows, fileRow } from "./common";
import { diffPane } from "./diff";

function ago(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  for (const [n, unit] of [[31536000, "y"], [2592000, "mo"], [604800, "w"], [86400, "d"], [3600, "h"], [60, "m"]] as const) {
    if (s >= n) return `${Math.floor(s / n)}${unit} ago`;
  }
  return "just now";
}

// graphOf lays out the graph once per list of commits.
let graphFor: unknown = null;
let graph: Graph = { rows: [], lanes: 1 };
function graphOf(a: App): Graph {
  if (graphFor !== a.commits) [graphFor, graph] = [a.commits, layoutGraph(a.commits)];
  return graph;
}

const laneCols = 2;

// refPills draws a commit's branches and tags as Git Graph does: pills in
// the colour of its lane, HEAD's branch bold, remote ones dimmer, tags in
// the warning colour.
function refPills(l: Line, refs: string, laneColor: RGB, a: App): void {
  const t = a.theme;
  for (let ref of refs.split(", ").filter(Boolean)) {
    let color = laneColor, bold = false;
    if (ref.startsWith("HEAD -> ")) [ref, bold] = [ref.slice(8), true];
    else if (ref === "HEAD" || ref.endsWith("/HEAD")) continue;
    else if (ref.startsWith("tag: ")) [ref, color] = [ref.slice(5), t.warning];
    else if (ref.includes("/")) color = mix(t.secondary, laneColor, 0.5);
    if (l.left < width(ref) + 6) return;
    l.pill(`${color === t.warning ? "" : branchIcon + " "}${ref}`, color, mix(l.base, color, 0.18), bold).add(" ", t.content);
  }
}

export function history(a: App): string[] {
  const t = a.theme, cols = bodyCols(a), rows = bodyRows(a), inner = cols - 2;
  const tableRows = Math.max(8, Math.round(rows * 0.5));
  const g = graphOf(a);
  const lanes = [t.accent, t.info, t.success, t.warning, t.danger, t.secondary];
  const head = a.commits.findIndex((c) => /(^|, )HEAD/.test(c.refs));
  const { contentTop, listCols } = layoutOf(a);

  // The table: a header row, then the commits as a tile list, the graph
  // drawn as a strip of pictures down its first column. Each commit takes
  // two rows, its own and the air below, so the list scrolls in pairs.
  const count = Math.max(1, Math.trunc((tableRows - 2 - 2) / 2));
  if (a.follow && a.hsel < a.htop) a.htop = a.hsel;
  if (a.follow && a.hsel >= a.htop + count) a.htop = a.hsel - count + 1;
  a.htop = Math.max(0, Math.min(a.htop, Math.max(0, a.commits.length - count)));
  const gw = Math.max(7, Math.min(24, g.lanes * laneCols + 1));
  const dateW = 9, authorW = Math.min(18, Math.max(8, Math.round(inner * 0.14))), shaW = 7;
  const table: Line[] = [
    row(inner, t.sidebar, null, (l) => {
      l.add(clip(" Graph", gw).padEnd(gw), t.tertiary, { bold: true }).add("  Description", t.tertiary, { bold: true });
      return l.right(`${"Date".padEnd(dateW)}  ${"Author".padEnd(authorW)}  ${"Commit".padEnd(shaW)} `, t.tertiary, { bold: true });
    }),
  ];
  const listAt: [number, number] = [contentTop + 1, 2];
  const list = tileList<git.Commit>({
    items: a.commits,
    selected: a.hsel,
    top: a.htop * 2,
    follow: false,
    rows: 1 + count * 2,
    cols: inner,
    base: t.sidebar,
    fill: a.focus === "list" ? t.selected : t.hover,
    at: listAt,
    lead: true,
    hit: (screen, i) => a.rowMap.set(screen, i),
    draw: (l, c, i, on) => {
      l.pad(gw).add("  ", t.content);
      refPills(l, c.refs, lanes[(g.rows[i]?.color ?? 0) % lanes.length], a);
      l.add(clip(c.subject, l.left - dateW - authorW - shaW - 7), t.content, { bold: on });
      const author = clip(c.author, authorW).padEnd(authorW);
      const date = `${ago(c.at).padEnd(dateW)}  `, sha = `${c.short.slice(0, shaW).padEnd(shaW)} `;
      return l.pad(l.left - width(date) - width(author) - 2 - width(sha)).add(date, t.secondary).add(`${author}  `, t.secondary).add(sha, t.accent);
    },
  });
  table.push(...list.lines);
  if (a.commits.length === 0) table[2] = row(inner, t.sidebar, null, (l) => l.add(" No commits yet", t.tertiary));
  const shown = Math.min(count, Math.max(0, a.commits.length - a.htop));
  // The graph is drawn once, in tiles, and scrolled by placing part of it.
  frame.setStrip({
    // The colours, not just the theme's name: a palette change keeps the name.
    key: `${a.commits.length}:${a.commits[0]?.sha}:${lanes.join(";")}:${t.sidebar}:${head}:${gw}`,
    tile: 100,
    per: 2,
    top: a.htop,
    shown,
    row: listAt[0] + 1,
    col: 3,
    cols: gw,
    draw: (first, n, cellW, cellH) => drawGraph(g, { top: first, count: n, rowsPer: 2, cellW, cellH, laneCols, head, cols: gw }, lanes, t.sidebar),
  });

  // Below, on the left: the commit's card, then its files in a card only as
  // tall as they need; on the right, the chosen file's diff.
  const lower = rows - tableRows, fw = listCols - 2;
  const c = a.commits[a.hsel];
  const filesRows = Math.min(lower - 8, 3 + (a.files.length === 0 ? 1 : a.files.length * 2 + 1));
  const detailRows = lower - filesRows;

  const details: Line[] = [];
  if (c) {
    for (const l of wrap(c.subject, fw - 4)) details.push(row(fw, t.sidebar, null, (x) => x.add(" " + l, t.content, { bold: true })));
    details.push(blank(fw, t.sidebar));
    const meta = (label: string, value: string, color: RGB) => row(fw, t.sidebar, null, (x) => x.add(" " + label.padEnd(8), t.tertiary).add(clip(value, x.left - 1), color));
    details.push(meta("author", c.author, t.content), meta("email", c.email, t.secondary), meta("date", new Date(c.at).toLocaleString(), t.secondary), meta("commit", c.sha.slice(0, 12), t.accent));
    if (c.parents.length > 1) details.push(meta("merges", c.parents.map((p) => p.slice(0, 7)).join(" + "), t.secondary));
    if (c.body) {
      details.push(blank(fw, t.sidebar));
      for (const l of wrap(c.body, fw - 4)) details.push(row(fw, t.sidebar, null, (x) => x.add(" " + l, t.secondary)));
    }
  }

  const filesTop = 1 + tableRows + detailRows;
  const files: Line[] = [sectionHeader(t, fw, t.sidebar, "FILES", a.files.length)];
  if (a.files.length === 0) files.push(row(fw, t.sidebar, null, (l) => l.add(c && c.parents.length > 1 ? " No file changes of its own (a merge)" : " No file changes", t.tertiary)));
  else {
    const fl = tileList<git.CommitFile>({
      items: a.files,
      selected: a.fsel,
      top: a.ftop,
      follow: a.follow,
      rows: filesRows - 3,
      cols: fw,
      base: t.sidebar,
      fill: t.selected,
      at: [filesTop + 2, 2],
      lead: true,
      hit: (screen, i) => a.rowMap.set(screen, 100000 + i),
      draw: (l, f, _i, on) => fileRow(a, l, f.path, f.code, on, false),
    });
    a.ftop = fl.top;
    files.push(...fl.lines);
  }

  const dcols = cols - listCols - 1;
  const right = a.files.length > 0 ? diffPane(a, dcols - 2, lower - 2) : [];
  // The commits' side lifts together: the table and the cards under it.
  const listFocused = a.focus === "list";
  const leftCol = [...card(details, listCols, detailRows, t.sidebar, t.canvas, [1 + tableRows, 1], listFocused), ...card(files, listCols, filesRows, t.sidebar, t.canvas, [filesTop, 1], listFocused)];
  return [...card(table, cols, tableRows, t.sidebar, t.canvas, [1, 1], listFocused), ...beside(a, leftCol, card(right, dcols, lower, t.surface, t.canvas, [1 + tableRows, listCols + 2], !listFocused))];
}
