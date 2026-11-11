// What a click or the wheel does, by where it lands.
import type { Mouse } from "../terminal/input";
import { type App, scopes } from "./app";
import { layoutOf, tabHits } from "./layout";
import { openPicker, pick } from "./branches";
import { chooseScope } from "./settings";
import { sync } from "./remote";
import { stageAll, toggleStage, unstageAll } from "./changes";
import { loadDiff } from "./diffs";

// A trackpad sends a stream of small wheel events, a frame or so apart, and
// a wheel notch one event, so an event close behind another moves a single
// line or column and a lone one moves `big`, which keeps both feeling right.
// The gap is kept under how fast a spun wheel's notches come, so spinning
// faster never scrolls slower.
let lastWheel = 0;
function wheelStep(big: number): number {
  const now = performance.now(), quick = now - lastWheel < 20;
  lastWheel = now;
  return quick ? 1 : big;
}

// wheelDelta is how far a wheel event moves: negative for up or left, by
// `big` or by one when it comes in a stream; 0 for any other button.
function wheelDelta(m: Mouse, big: number): number {
  return m.button >= 64 && m.button <= 67 ? (m.button === 64 || m.button === 66 ? -1 : 1) * wheelStep(big) : 0;
}

export async function mouse(a: App, m: Mouse): Promise<void> {
  if (m.release || m.motion) return;
  a.follow = m.button < 64 || m.button > 67;
  // A popup takes every click: one outside closes it.
  if (a.prompt) {
    if (m.button !== 0) return;
    const [r, c, h, w] = a.popupRect;
    if (!(m.y >= r && m.y < r + h && m.x >= c && m.x < c + w)) a.prompt = null;
    return a.render();
  }
  if (a.picker) {
    const at = a.pickerRows.get(m.y);
    if (m.button === 64 || m.button === 65) a.picker.sel = Math.max(0, Math.min(a.pickerItems().length - 1, a.picker.sel + (m.button === 64 ? -1 : 1)));
    else if (m.button === 0 && at !== undefined) return pick(a, at);
    else if (m.button === 0 && !a.pickerHit(m.x, m.y)) a.picker = null;
    return a.render();
  }

  const row = m.y, col = m.x;
  if (row === 0) {
    // The tab strip is drawn right-aligned in the header.
    if (col >= a.branchSpan[0] && col < a.branchSpan[1]) return openPicker(a);
    const hit = tabHits(a).find((h) => col >= h.from && col < h.to);
    if (hit) await a.setTab(hit.tab);
    return;
  }
  // The sideways wheel scrolls the diff's code, wherever the diff is.
  const { listRight, listStart, syncRow } = layoutOf(a);
  if (m.button === 66 || m.button === 67) {
    if (col >= listRight && (a.tab === "changes" || (a.tab === "history" && row > a.size.rows / 2))) {
      a.diffLeft = Math.max(0, a.diffLeft + wheelDelta(m, 4));
      a.render();
    }
    return;
  }
  if (a.tab !== "changes") return otherMouse(a, m);
  const inList = col < listRight;
  if (m.button === 64 || m.button === 65) {
    const d = wheelDelta(m, 3);
    if (inList) a.listTop = Math.max(0, a.listTop + d);
    else a.diffTop = Math.max(0, Math.min(a.diffTop + d, a.rows().length - 1));
    return a.render();
  }
  if (m.button !== 0) return;
  if (!inList) {
    a.focus = "diff";
    return a.render();
  }
  const i = a.rowMap.get(row) ?? -1;
  if (row === syncRow) return void sync(a);
  if (row < listStart) {
    a.focus = "message";
    return a.render();
  }
  const onButton = !a.padRows.has(row) && col >= listRight - 4;
  const it = a.items[i];
  // The list's background, and a section's header, focus it too.
  if (!it || it.kind === "header") a.focus = "list";
  if (!it) return a.render();
  if (it.kind === "header") {
    // The header's button stages or unstages everything in its section.
    if (onButton && it.count > 0) return void (await (it.staged ? unstageAll : stageAll)(a));
    return a.render();
  }
  a.focus = "list";
  a.sel = i;
  // The + or − at the row's end stages or unstages the file, as VS Code's inline button does.
  if (onButton) return void (await toggleStage(a, it.change));
  await loadDiff(a);
  a.render();
}

// otherMouse selects rows in the History, Branches and Config tabs, and
// scrolls them with the wheel.
export async function otherMouse(a: App, m: Mouse): Promise<void> {
  const wheel = wheelDelta(m, 3);
  if (a.tab === "history") {
    // The table's rows map to commits, the files' to 100000 + their index.
    const hit = a.rowMap.get(m.y);
    if (wheel) {
      if (hit !== undefined && hit >= 100000) a.ftop = Math.max(0, a.ftop + wheel);
      else if (m.y > a.size.rows / 2 && m.x >= layoutOf(a).listRight) a.diffTop = Math.max(0, Math.min(a.diffTop + wheel, a.rows().length - 1));
      else a.htop = Math.max(0, Math.min(a.htop + wheel, a.commits.length - 1));
      return a.render();
    } else if (m.button === 0 && hit !== undefined) {
      if (hit >= 100000) a.fsel = hit - 100000;
      else [a.hsel, a.focus] = [hit, "list"];
    } else if (m.button === 0 && m.y > a.size.rows / 2) a.focus = "diff";
    await loadDiff(a);
    return a.render();
  }
  // The scope pills, where draw put them.
  const pill = m.button === 0 && m.y === a.scopeRow ? a.scopeSpans.findIndex(([from, to]) => m.x >= from && m.x < to) : -1;
  if (pill >= 0) {
    await chooseScope(a, scopes[pill]);
    return a.render();
  }
  const i = a.rowMap.get(m.y) ?? -1;
  if (wheel) a.ctop = Math.max(0, a.ctop + wheel);
  else if (m.button === 0 && a.configRows[i]?.kind === "entry") a.csel = i;
  a.render();
}
