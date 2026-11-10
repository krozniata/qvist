// Loading the diff on screen in the background, and keeping its place.
import * as git from "../git";
import { buildDiff, type Diff, type Row } from "../model/diff";
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
  if (force) go();
  else setTimeout(go, 40);
  return Promise.resolve();
}

export async function fetchDiff(a: App, token: number, force: boolean): Promise<void> {
  let key = "";
  let load: (() => Promise<Diff>) | null = null;
  if (a.tab === "changes") {
    const c = a.current(), repo = a.repo;
    if (c && repo) [key, load] = [`${c.staged}:${c.path}:${a.full}`, async () => buildDiff(c.path, await git.patchFor(repo, c, a.context()))];
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
    if (c && f) [key, load] = [`h:${c.sha}:${f.path}:${a.full}`, async () => buildDiff(f.path, await git.commitPatch(repo, c.sha, f.path, a.context()))];
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
  const hit = force && !key.startsWith("h:") ? undefined : a.diffCache.get(key);
  if (hit) {
    [a.diff, a.diffLoading, a.diffSlow] = [hit, false, false];
    toAnchor(a);
    return a.render();
  }
  a.diffLoading = true;
  setTimeout(() => {
    if (token !== a.diffToken || !a.diffLoading) return;
    a.diffSlow = true;
    a.render();
  }, 150);
  const d = await load();
  if (token !== a.diffToken) return;
  a.diffCache.set(key, d);
  if (a.diffCache.size > 100) a.diffCache.delete(a.diffCache.keys().next().value!);
  [a.diff, a.diffLoading, a.diffSlow] = [d, false, false];
  toAnchor(a);
  a.diffTop = Math.min(a.diffTop, Math.max(0, a.rows().length - 1));
  a.render();
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
