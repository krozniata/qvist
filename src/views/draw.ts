// Draws the pane's screens in the Rex theme from the shared components in
// ui/: cards on the canvas, lists of padded tiles, fields and segmented
// controls, with Pierre's diff in its own card.
import type { App } from "../app/app";
import { tabHits, tabTitle } from "../app/layout";
import { branchIcon, repoIcon } from "../ui/icons";
import { bg } from "../theme";
import * as frame from "../ui/frame";
import { Line } from "../ui/line";
import { segmented } from "../ui/segmented";
import { width } from "../ui/text";
import { changes, messageCursor } from "./changes";
import { history } from "./history";
import { config } from "./config";
import { picker, pickerCursor } from "./picker";
import { popupCursor, promptPopup } from "./popups";

// The rows the terminal shows now, as last sent, so a frame sends only the
// rows that changed; and the overlay drawn over them, with the rows it covered.
let shown: string[] = [];
let shownSize = "";
let overlay = "";
let overlaid: number[] = [];

// invalidate forgets what the terminal shows, so the next frame sends every
// row, as after something else drew on the screen.
export function invalidate(): void {
  shown = [];
}

export function draw(a: App): void {
  const s = a.size;
  if (s.rows < 10 || s.cols < 50) return;
  const t = a.theme;
  frame.begin(s, t.sidebar);
  a.rowMap.clear();
  a.padRows.clear();
  let rows: string[];
  if (a.loading) rows = loadingRows(a);
  else {
    rows = [header(a).toString()];
    const body = a.tab === "changes" ? changes(a) : a.tab === "history" ? history(a) : config(a);
    // A column of canvas either side keeps the cards off the pane's edges.
    for (const l of body) rows.push(`${bg(t.canvas)} ${l}${bg(t.canvas)} `);
    rows[s.rows - 1] = footer(a).toString();
  }

  // Overlays draw over the rows; they go last, after the frame's other rows.
  let over = "";
  const covers: number[] = [];
  const cover = ([r, , h]: [number, number, number, number]) => {
    for (let i = r; i < r + h; i++) covers.push(i);
  };
  if (a.picker) [over] = [over + picker(a), cover(a.pickerRect)];
  if (a.prompt) [over] = [over + promptPopup(a), cover(a.popupRect)];

  // A new size starts over; an overlay that changed or closed leaves the rows
  // it covered to be drawn again.
  const size = `${s.rows}x${s.cols}`;
  if (size !== shownSize) [shown, shownSize] = [[], size];
  if (over !== overlay) for (const i of overlaid) shown[i] = "";
  let out = "\x1b[?2026h";
  rows.forEach((r, i) => {
    if (r !== shown[i]) out += `\x1b[${i + 1};1H${r}\x1b[0m`;
  });
  [shown, overlay, overlaid] = [rows, over, covers];
  out += over;
  out += frame.render(s);
  out += a.prompt ? popupCursor(a, 0, a.prompt.value) : a.picker ? pickerCursor(a) : a.focus === "message" && a.tab === "changes" ? messageCursor(a) : "\x1b[?25l";
  out += "\x1b[?2026l";
  a.t.write(out);
  a.t.flush();
}

// loadingRows is the pane while qvist reads the repository: a spinner and
// the repository's name in the middle of the canvas.
const spinner = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function loadingRows(a: App): string[] {
  const t = a.theme, { rows, cols } = a.size;
  const frame = spinner[a.spin % spinner.length], label = a.name ? `Opening ${a.name}…` : "Opening…";
  const blank = new Line(cols, t.canvas).toString();
  const middle = new Line(cols, t.canvas).pad(Math.trunc((cols - width(frame) - 2 - width(label)) / 2)).add(frame, t.accent).add("  " + label, t.tertiary).toString();
  return Array.from({ length: rows }, (_, i) => (i === Math.trunc(rows / 2) ? middle : blank));
}

// header: the repository and branch, then the tabs

function header(a: App): Line {
  const t = a.theme, s = a.status;
  const l = new Line(a.size.cols, t.canvas).add("  " + repoIcon + " ", t.accent).add(a.name || "qvist", t.content, { bold: true });
  if (s) {
    l.add("   ", t.content);
    const from = a.size.cols - l.left;
    l.add(branchIcon + " ", t.tertiary).add(s.branch, a.picker ? t.accent : t.secondary, { bold: !!a.picker }).add(" ▾", t.tertiary);
    a.branchSpan = [from, a.size.cols - l.left];
    if (s.ahead) l.add(` ↑${s.ahead}`, t.secondary);
    if (s.behind) l.add(` ↓${s.behind}`, t.secondary);
  }
  const hits = tabHits(a);
  l.pad(hits[0].from - (a.size.cols - l.left));
  segmented(l, t, hits.map((h, i) => ({ label: tabTitle[h.tab], on: h.tab === a.tab, key: String(i + 1) })), hits[0].from);
  return l;
}

// ── footer: the shortcuts for what has focus, a question, a field or a note ──

function footer(a: App): Line {
  const t = a.theme;
  const l = new Line(a.size.cols, t.canvas).add("  ", t.content);
  if (a.confirm) {
    return l.add(a.confirm.question, t.warning, { bold: true }).add("   y ", t.content, { bold: true }).add("yes", t.secondary).add("   n ", t.content, { bold: true }).add("no", t.secondary);
  }
  if (Date.now() < a.noteUntil) return l.add(a.note, a.noteError ? t.danger : t.accent);
  const split: [string, string] = ["v", a.split ? "unified" : "split"];
  const full: [string, string] = ["e", a.full ? "collapse" : "expand"];
  const groups: [string, string][][] = a.prompt
      ? [[["⏎", "save"], ["esc", "cancel"]]]
    : a.picker
    ? a.picker.mode === "base"
      ? [[["type", "filter"], ["↑↓", "move"], ["⏎", "choose"], ["esc", "close"]]]
      : [[["⏎", "switch"], ["⌃D", "delete"], ["⌃R", "rename"], ["⌃T", "upstream"]], [["type", "filter"], ["esc", "close"]]]
    : a.tab === "config"
        ? [a.scope !== "system" ? [["⏎", "edit"], ["n", "add"], ["d", "remove"], ["e", "edit file"]] : [["e", "view file"]], [["[ ]", "scope"], ["1-3", "tabs"], ["q", "quit"]]]
        : a.tab === "history" && a.focus === "list"
          ? [[["j k", "commits"], ["[ ]", "files"], ["tab", "diff"]], [split, ["b", "branch"], ["q", "quit"]]]
          : a.tab === "history"
            ? [[["j k", "scroll"], ["[ ]", "files"]], [["tab", "commits"], split, full]]
            : a.focus === "message"
              ? [[["⏎", "commit"], ["⌃J", "new line"], ["⌃A", a.amend ? "don't amend" : "amend"], ["esc", "done"]]]
              : a.focus === "list"
                ? [[["space", "stage"], ["a", "stage all"], ["u", "unstage all"], ["d", "discard"], ["c", "commit"]], [["p", "pull"], ["P", "push"], ["f", "fetch"]], [["tab", "diff"], split, ["b", "branch"], ["q", "quit"]]]
                : [[["j k", "scroll"], ["←→", "scroll"]], [["tab", "list"], split, full]];
  groups.forEach((g, gi) => {
    if (gi > 0) l.add("│  ", t.strokeSubtle);
    for (const [key, label] of g) {
      if (l.left < width(key) + width(label) + 4) return;
      l.add(key, t.content, { bold: true }).add(` ${label}   `, t.secondary);
    }
  });
  // A newer release goes at the right, when the shortcuts leave room for it.
  const note = "Update available! Run ", cmd = "qvist upgrade";
  if (a.upgrade && l.left >= width(note) + width(cmd) + 2) l.pad(l.left - width(note) - width(cmd) - 2).add(note, t.success).add(cmd, t.success, { bold: true });
  return l;
}
