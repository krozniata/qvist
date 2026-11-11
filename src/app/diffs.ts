// Loading the diff on screen in the background, and keeping its place.
import * as git from "../git";
import { buildIfIdle, buildInBackground } from "../model/background";
import type { Diff, Row } from "../model/diff";
import type { App } from "./app";

// lineNo answers a diff row's line number in the new file, or the old for a
// deleted line; 0 for a hunk's separator.
function lineNo(r: Row): number {
  if (r.kind === "hunk") return 0;
  if (r.kind === "line") return r.new || r.old;
  return r.right?.no || r.left?.no || 0;
}

// changed answers whether a diff row adds or removes a line.
function changed(r: Row): boolean {
  if (r.kind === "hunk") return false;
  if (r.kind === "line") return r.type !== "context";
  return r.left?.type !== "context" || r.right?.type !== "context";
}

// The cache's keys: a changed file's diff, and a commit's, which the prefix
// sets apart since a commit's never changes and a file's may.
const changesKey = (a: App, c: git.Change) => `${c.staged}:${c.path}:${a.full}`;
const historyKey = (a: App, sha: string, path: string) => `h:${sha}:${path}:${a.full}`;
const isHistoryKey = (key: string) => key.startsWith("h:");

// dropFileDiffs forgets the changed files' diffs after the files may have
// changed: those of the paths given, or all of them. It also stops any diff
// being built, which may have read a patch from before the change.
export function dropFileDiffs(a: App, paths?: Iterable<string>): void {
  a.diffToken++;
  const only = paths && new Set(paths);
  for (const k of a.diffCache.keys()) {
    if (isHistoryKey(k)) continue;
    // A changed file's key is "staged:path:full", and neither end has a colon.
    if (!only || only.has(k.slice(k.indexOf(":") + 1, k.lastIndexOf(":")))) a.diffCache.delete(k);
  }
}

// recall answers a kept diff, and keeps it longest of those there now.
function recall(a: App, key: string): Diff | undefined {
  const d = a.diffCache.get(key);
  if (d) {
    a.diffCache.delete(key);
    a.diffCache.set(key, d);
  }
  return d;
}

// remember keeps a built diff, a hundred at most. The one used longest ago
// goes first, a changed file's before a commit's, since a commit's never
// changes and prefetch can always build a file's again.
function remember(a: App, key: string, d: Diff): void {
  a.diffCache.delete(key);
  a.diffCache.set(key, d);
  if (a.diffCache.size <= 100) return;
  let old: string | undefined;
  for (const k of a.diffCache.keys()) if (!isHistoryKey(k)) {
    old = k;
    break;
  }
  a.diffCache.delete(old ?? a.diffCache.keys().next().value!);
}

// loadDiff waits a moment for the selection to settle, so holding j only
// loads where it stops; a refresh loads at once.
export function loadDiff(a: App, force = false): Promise<void> {
  const token = ++a.diffToken;
  const go = () => {
    if (token !== a.diffToken) return;
    fetchDiff(a, token, force).catch((err) => {
      if (token === a.diffToken) a.flash(err instanceof Error ? err.message : String(err), true);
    });
  };
  const c = a.tab === "changes" ? a.current() : null;
  if (force || (c && a.diffCache.has(changesKey(a, c)))) go();
  else setTimeout(go, 40);
  return Promise.resolve();
}

export async function fetchDiff(a: App, token: number, force: boolean): Promise<void> {
  let key = "";
  let load: (() => Promise<[path: string, patch: string]>) | null = null;
  if (a.tab === "changes") {
    const c = a.current(), repo = a.repo;
    if (c && repo) [key, load] = [changesKey(a, c), async () => [c.path, await git.patchFor(repo, c, a.context())]];
  } else if (a.tab === "history") {
    const c = a.commits[a.hsel], repo = a.repo!;
    if (c && a.filesOf !== c.sha) {
      a.filesOf = c.sha;
      a.fsel = 0;
      a.ftop = 0;
      let files = a.filesCache.get(c.sha);
      if (!files) {
        a.files = [];
        files = await git.commitFiles(repo, c.sha);
        a.filesCache.set(c.sha, files);
        if (token !== a.diffToken) return;
      }
      a.files = files;
    }
    const f = a.files[a.fsel];
    if (c && f) [key, load] = [historyKey(a, c.sha, f.path), async () => [f.path, await git.commitPatch(repo, c.sha, f.path, a.context())]];
  } else {
    return;
  }
  if (!force && key === a.diffKey && (a.diff || !load)) return;
  if (key !== a.diffKey) {
    [a.diffTop, a.diffLeft] = [0, 0];
    // A new file opens on its first change; a toggle keeps its own anchor.
    if (!a.anchor) a.anchor = -1;
  }
  a.diffKey = key;
  if (!load) {
    [a.diff, a.diffLoading, a.diffSlow] = [null, false, false];
    return a.render();
  }
  const hit = force && !isHistoryKey(key) ? undefined : recall(a, key);
  if (hit) {
    [a.diff, a.diffLoading, a.diffSlow] = [hit, false, false];
    toAnchor(a);
    a.render();
    return prefetch(a, token);
  }
  a.diffLoading = true;
  setTimeout(() => {
    if (token !== a.diffToken || !a.diffLoading) return;
    a.diffSlow = true;
    a.render();
  }, 400);
  const [path, patch] = await load();
  if (token !== a.diffToken) return;
  // Rows to show come back at once and their colours follow, so the diff
  // opens where it should before the first of them arrives.
  let shown = false;
  const d = await buildInBackground(path, patch, {
    show: (live) => {
      if (token !== a.diffToken) return;
      [a.diff, a.diffLoading, a.diffSlow] = [live, false, false];
      if (!shown) toAnchor(a);
      shown = true;
      a.render();
    },
    progress: () => {
      if (token === a.diffToken) a.render();
    },
  });
  if (!d || token !== a.diffToken) return;
  remember(a, key, d);
  [a.diff, a.diffLoading, a.diffSlow] = [d, false, false];
  if (!shown) toAnchor(a);
  a.diffTop = Math.min(a.diffTop, Math.max(0, a.rows().length - 1));
  a.render();
  return prefetch(a, token);
}

// How many changed files prefetch takes on, and how long a patch it leaves
// for when it is opened.
const prefetchFiles = 40, prefetchLongest = 150_000;

// prefetch builds the diffs of the changed files while nothing else is asked,
// nearest the selection first, so moving to one shows it at once. It starts
// once things have settled, stops when the selection or the files change, and
// gives a file a few tries to find the worker free.
async function prefetch(a: App, token: number): Promise<void> {
  if (a.tab !== "changes" || !a.repo) return;
  const repo = a.repo, sel = a.sel;
  const near = a.items
    .map((it, i) => ({ it, i }))
    .filter((x) => x.it.kind === "file" && x.i !== sel)
    .sort((x, y) => Math.abs(x.i - sel) - Math.abs(y.i - sel))
    .slice(0, prefetchFiles);
  for (const [n, { it }] of near.entries()) {
    // The two nearest files go at once; the rest wait for things to settle.
    if (n === 2) await Bun.sleep(300);
    if (it.kind !== "file") continue;
    const c = it.change, key = changesKey(a, c);
    if (token !== a.diffToken) return;
    if (a.diffCache.has(key)) continue;
    const patch = await git.patchFor(repo, c, a.context()).catch(() => null);
    if (token !== a.diffToken) return;
    if (patch === null || patch.length > prefetchLongest) continue;
    let built: Diff | null = null;
    for (let tries = 0; !built && tries < 20; tries++) {
      built = await buildIfIdle(c.path, patch).catch(() => null);
      if (token !== a.diffToken) return;
      if (!built) await Bun.sleep(100);
    }
    if (!built) continue;
    remember(a, key, built);
  }
}

// toggleFull shows or hides the unmodified lines, keeping the line at the
// diff's top where it was.
export function toggleFull(a: App): Promise<void> {
  a.full = !a.full;
  const rows = a.rows();
  for (let i = Math.min(a.diffTop, rows.length - 1); i < rows.length && i >= 0; i++) {
    const n = lineNo(rows[i]);
    if (n > 0) {
      a.anchor = n;
      break;
    }
  }
  return loadDiff(a, true);
}

// toAnchor scrolls the diff to the anchored line, once.
export function toAnchor(a: App): void {
  if (!a.anchor) return;
  const rows = a.rows();
  if (a.anchor === -1) {
    // A few lines of what comes before the change stay above it.
    const i = rows.findIndex(changed);
    a.diffTop = Math.max(0, i - 3);
    a.anchor = 0;
    return;
  }
  let i = rows.findIndex((r) => lineNo(r) >= a.anchor);
  if (i > 0 && rows[i - 1].kind === "hunk") i--;
  if (i >= 0) a.diffTop = i;
  a.anchor = 0;
}
