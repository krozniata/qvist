// The Changes tab: the message, commit and sync buttons and the files in a
// card, beside the diff's card.
import type { App, Item } from "../app/app";
import { layoutOf } from "../app/layout";
import { field, fieldCursor } from "../ui/field";
import { card, tileEdge } from "../ui/frame";
import { blank, Line, row } from "../ui/line";
import { sectionHeader, tileList } from "../ui/list";
import { clip, width } from "../ui/text";
import { beside, bodyCols, bodyRows, fileRow } from "./common";
import { diffPane } from "./diff";

export function changes(a: App): string[] {
  const t = a.theme, { listCols, messageRows, contentTop } = layoutOf(a);
  const rows = bodyRows(a), inner = listCols - 2;
  const left: Line[] = [];

  // The message.
  const msgLines = a.message === "" ? [] : a.message.split("\n").slice(-messageRows);
  left.push(...field(t, { cols: inner, base: t.sidebar, at: [contentTop, 2], rows: messageRows, text: msgLines, placeholder: "Message", hint: "c", focused: a.focus === "message" }));

  // The commit button, a tile that lights up once something is staged.
  const staged = a.status?.staged.length ?? 0;
  const ready = staged > 0 || a.amend;
  const label = a.amend ? "✓  Amend last commit" : `✓  Commit${staged ? ` ${staged} file${staged === 1 ? "" : "s"}` : ""}`;
  const fill = ready ? t.accentContainer : t.raised;
  left.push(tileEdge(true, inner, fill, t.sidebar, contentTop + left.length, 2));
  left.push(row(inner, t.sidebar, fill, (l) => l.pad(Math.trunc((inner - 2 - width(label)) / 2)).add(label, ready ? t.accentOnContainer : t.tertiary, { bold: true }), true));
  left.push(tileEdge(false, inner, fill, t.sidebar, contentTop + left.length, 2));
  if (layoutOf(a).syncRow >= 0) left.push(...syncButton(a, inner, contentTop + left.length));
  left.push(blank(inner, t.sidebar));

  // The files, above who commits.
  const committer = committerRows(a, inner);
  const list = tileList<Item>({
    items: a.items,
    selected: a.current() ? a.sel : -1,
    top: a.listTop,
    follow: a.follow,
    rows: rows - 2 - left.length - committer.length - 1,
    cols: inner,
    base: t.sidebar,
    fill: a.focus === "list" ? t.selected : t.hover,
    at: [contentTop + left.length, 2],
    tile: (it) => it.kind === "file",
    hit: (screen, i) => a.rowMap.set(screen, i),
    draw: (l, it, _i, on) =>
      // The section titles take the accent while the list has focus.
      it.kind === "header" ? l.add(" " + (it.staged ? "STAGED CHANGES" : "CHANGES"), a.focus === "list" ? t.accent : t.secondary, { bold: true }).right(`${it.count} `, t.tertiary) : fileRow(a, l, it.change.path, it.change.code, on, true, 2),
  });
  a.listTop = list.top;
  left.push(...list.lines, blank(inner, t.sidebar), ...committer);

  const diffCols = bodyCols(a) - listCols - 1;
  const diffFocused = a.focus === "diff";
  return beside(a, card(left, listCols, rows, t.sidebar, t.canvas, [1, 1], !diffFocused), card(diffPane(a, diffCols - 2, rows - 2), diffCols, rows, t.surface, t.canvas, [1, listCols + 2], diffFocused));
}

// syncButton is the tile under the commit button that pulls, pushes or both,
// with how many commits each way; while it runs it says what it is doing.
function syncButton(a: App, cols: number, at: number): Line[] {
  const t = a.theme, s = a.status, what = a.syncWhat();
  const n = (k: number) => `${k} commit${k === 1 ? "" : "s"}`;
  const busy = { fetch: "Fetching…", pull: "Pulling…", push: "Pushing…", sync: "Syncing…" };
  // Level with the remote, or with none to sync with, the button stays but dims.
  const idle = !a.syncing && !what;
  const label = a.syncing
    ? busy[a.syncing]
    : !s || a.remotes.length === 0
      ? "No remote"
      : s.detached
        ? "Detached HEAD"
        : !what
          ? "⇅  Sync  ↓0 ↑0"
          : a.publishTo()
            ? "☁  Publish branch"
            : what === "sync"
              ? `⇅  Sync  ↓${s.behind} ↑${s.ahead}`
              : what === "push"
                ? `↑  Push ${n(s.ahead)}`
                : `↓  Pull ${n(s.behind)}`;
  const fill = t.raised, tone = a.syncing || idle ? t.tertiary : t.content;
  return [
    tileEdge(true, cols, fill, t.sidebar, at, 2),
    row(cols, t.sidebar, fill, (l) => l.pad(Math.trunc((cols - 2 - width(label)) / 2)).add(label, tone, { bold: true }).right("s ", t.tertiary), true),
    tileEdge(false, cols, fill, t.sidebar, at + 2, 2),
  ];
}

// committerRows shows who a commit will be by: the configured user.name and
// user.email, each left empty when it isn't set.
function committerRows(a: App, cols: number): Line[] {
  const t = a.theme, id = a.identity;
  const value = (label: string, v: string) => row(cols, t.sidebar, null, (l) => l.add(" " + label.padEnd(10), t.tertiary).add(clip(v, cols - 14), t.content));
  return [
    row(cols, t.sidebar, null, (l) => l.add("─".repeat(cols - 2), t.strokeSubtle)),
    // Who commits is set in Config, not here.
    sectionHeader(t, cols, t.sidebar, "Committer"),
    value("username", id?.name ?? ""),
    value("email", id?.email ?? ""),
  ];
}

export function messageCursor(a: App): string {
  const { messageRows, contentTop } = layoutOf(a);
  return fieldCursor({ at: [contentTop, 2], text: a.message.split("\n").slice(-messageRows) });
}
