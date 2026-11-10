// Popups: a centred card of labelled fields, over everything.
import type { App } from "../app/app";
import { field, fieldCursor } from "../ui/field";
import * as frame from "../ui/frame";
import { card } from "../ui/frame";
import { blank, Line, row } from "../ui/line";
import { sectionHeader } from "../ui/list";

type PopupField = { label?: string; value: string; placeholder: string; focused: boolean };

// popup draws a centred card with a title, a note at its right, and its
// fields, and records where it and each field went for clicks and the cursor.
function popup(a: App, title: string, note: string, fields: PopupField[]): string {
  const t = a.theme, base = t.sidebar;
  const cols = Math.min(52, a.size.cols - 4), inner = cols - 2;
  // Title and a blank row, then each field: its label (if any) and three rows.
  const rows = 2 + 2 + fields.reduce((n, f) => n + (f.label ? 1 : 0) + 3, 0);
  const top = Math.max(1, Math.trunc((a.size.rows - rows) / 2)), col = Math.trunc((a.size.cols - cols) / 2);
  a.popupRect = [top, col, rows, cols];
  // Images under the popup would cover it.
  frame.hide(a.popupRect);
  const lines: Line[] = [sectionHeader(t, inner, base, title).right(note ? `${note} ` : "", t.tertiary), blank(inner, base)];
  a.popupFields = [];
  for (const f of fields) {
    if (f.label) lines.push(row(inner, base, null, (l) => l.add(" " + f.label, t.tertiary)));
    // Content rows start one below the card's soft top edge.
    const at: [number, number] = [top + 1 + lines.length, col + 1];
    a.popupFields.push(at[0]);
    lines.push(...field(t, { cols: inner, base, at, rows: 1, text: f.value ? [f.value] : [], placeholder: f.placeholder, focused: f.focused }));
  }
  return card(lines, cols, rows, base, t.canvas, [top, col]).map((l, i) => `\x1b[${top + 1 + i};${col + 1}H${l}\x1b[0m`).join("");
}

export function popupCursor(a: App, field: number, value: string): string {
  return fieldCursor({ at: [a.popupFields[field], a.popupRect[1] + 1], text: [value] });
}

export function promptPopup(a: App): string {
  const p = a.prompt!;
  return popup(a, p.label, "", [{ value: p.value, placeholder: p.placeholder ?? "", focused: true }]);
}
