// A text field, as the commit message and the branch picker's filter use: a
// tile of text rows with soft rounded edges half a row above and below,
// inset a column on its base.
import type { RGB, Theme } from "../theme";
import { tileEdge } from "./frame";
import { Line, Padded } from "./line";
import { clip, width } from "./text";

export type FieldSpec = {
  cols: number; // the width it takes, its inset included
  base: RGB;
  at: [row: number, col: number]; // screen position of its top edge's first column
  rows: number;
  text: string[]; // the lines to show, already cut to the last `rows`
  placeholder: string;
  hint?: string; // shown at the right while empty and not focused
  focused: boolean;
};

export function field(t: Theme, f: FieldSpec): Line[] {
  const w = f.cols - 2, fill = f.focused ? t.selected : t.raised;
  const empty = f.text.length === 0 || (f.text.length === 1 && f.text[0] === "");
  const out = [tileEdge(true, f.cols, fill, f.base, f.at[0], f.at[1])];
  for (let i = 0; i < f.rows; i++) {
    const hint = i === 0 && empty && !f.focused && f.hint ? f.hint + "  " : "";
    const text = empty ? (i === 0 ? f.placeholder : "") : (f.text[i] ?? "");
    const l = new Line(w, fill).add("  " + clip(text, w - 3 - width(hint)), empty ? t.tertiary : t.content);
    out.push(new Padded(hint ? l.right(hint, t.tertiary) : l, f.base));
  }
  out.push(tileEdge(false, f.cols, fill, f.base, f.at[0] + f.rows + 1, f.at[1]));
  return out;
}

// fieldCursor puts the cursor after the last line of text: past the inset
// and the field's two columns of padding.
export function fieldCursor(f: Pick<FieldSpec, "at" | "text">): string {
  const lines = f.text.length === 0 ? [""] : f.text;
  const row = f.at[0] + 1 + (lines.length - 1);
  const col = f.at[1] + 1 + 2 + width(lines[lines.length - 1]);
  return `\x1b[${row + 1};${col + 1}H\x1b[?25h`;
}
