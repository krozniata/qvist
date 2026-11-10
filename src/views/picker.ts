// The branch picker, dropped down from the header's branch.
import type { App, PickerItem } from "../app/app";
import { branchIcon } from "../ui/icons";
import { field, fieldCursor } from "../ui/field";
import * as frame from "../ui/frame";
import { card } from "../ui/frame";
import { Line, row } from "../ui/line";
import { tileList } from "../ui/list";
import { clip } from "../ui/text";

export function picker(a: App): string {
  const t = a.theme, p = a.picker!, items = a.pickerItems();
  const col = Math.max(1, a.branchSpan[0] - 2);
  const cols = Math.min(46, a.size.cols - col - 1), inner = cols - 2;
  const listRows = Math.max(1, Math.min(items.length * 2 + 1, a.size.rows - 8));
  const rows = 2 + 3 + listRows, base = t.sidebar;
  a.pickerRect = [1, col, rows, cols];
  a.pickerRows.clear();
  // Images under the picker would cover it.
  frame.hide(a.pickerRect);

  const lines = field(t, { cols: inner, base, at: [2, col + 1], rows: 1, text: p.query ? [p.query] : [], placeholder: p.mode === "base" ? "Filter base branches…" : "Filter branches…", focused: true });
  p.sel = Math.max(0, Math.min(p.sel, items.length - 1));
  const list = tileList<PickerItem>({
    items,
    selected: p.sel,
    top: p.top,
    follow: true,
    rows: listRows,
    cols: inner,
    base,
    fill: t.accentContainer,
    at: [5, col + 1],
    lead: true,
    hit: (screen, i) => a.pickerRows.set(screen, i),
    draw: (l, item, _i, on) => pickerRow(a, l, item, on),
  });
  p.top = list.top;
  lines.push(...list.lines);
  if (items.length === 0) lines.push(row(inner, base, null, (l) => l.add(" No branches", t.tertiary)));
  return card(lines, cols, rows, base, t.canvas, [1, col]).map((l, i) => `\x1b[${2 + i};${col + 1}H${l}\x1b[0m`).join("");
}

function pickerRow(a: App, l: Line, item: PickerItem, on: boolean): Line {
  const t = a.theme;
  l.add(" ", t.content);
  if (item.kind !== "branch") {
    const named = item.name ? `'${clip(item.name, l.left - 26)}'` : "";
    const label = item.kind === "create" ? (named ? `Create branch ${named}` : "Create new branch…") : named ? `Create branch ${named} from…` : "Create new branch from…";
    return l.add("+ ", t.accent, { bold: true }).add(label, on ? t.accentOnContainer : t.content, { bold: on });
  }
  const b = item.branch;
  l.add(branchIcon + " ", b.current ? t.success : b.remote ? t.tertiary : t.secondary);
  l.add(clip(b.name, l.left - 10), on ? t.accentOnContainer : b.remote ? t.secondary : t.content, { bold: on || b.current });
  // At the right: whether it's the current one, how far it is from its
  // upstream, or the upstream it tracks.
  const track = b.track.replace(/[[\]]/g, "");
  if (b.current) l.right(track ? `${track}  current ` : "current ", t.success);
  else if (track) l.right(`${track} `, t.warning);
  else if (b.upstream) l.right(`→ ${clip(b.upstream, Math.max(4, l.left - 4))} `, t.tertiary);
  return l;
}

export function pickerCursor(a: App): string {
  return fieldCursor({ at: [2, a.pickerRect[1] + 1], text: [a.picker!.query] });
}
