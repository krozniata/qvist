// The list every view uses: a row of air between rows, which the selected
// row's tile reaches half a row into, so it reads as a padded button.
import type { RGB, Theme } from "../theme";
import { tileEdge } from "./frame";
import { blank, type Line, row } from "./line";

// scrollTo moves top so that drawn row at shows in a window of rows, with a
// row of context where there is one; without follow it only keeps top in range.
export function scrollTo(top: number, at: number, rows: number, total: number, follow = true): number {
  if (follow && at >= 0 && at < top + 1) top = at - 1;
  if (follow && at >= 0 && at > top + rows - 2) top = at - rows + 2;
  return Math.max(0, Math.min(top, total - rows));
}

export type TileListSpec<T> = {
  items: T[];
  selected: number; // the selected item, or -1
  top: number; // the first drawn row shown; tileList answers the new one
  follow: boolean; // scroll to keep the selection in view
  rows: number;
  cols: number; // the width, its inset included
  base: RGB;
  fill: RGB; // the selected row's tile
  at: [row: number, col: number]; // screen position of the first row
  lead?: boolean; // a row of air above the first item
  tile?: (item: T) => boolean; // which items can be a tile (default: all)
  draw: (l: Line, item: T, i: number, on: boolean) => Line; // a row's content
  hit?: (screenRow: number, i: number) => void; // where each item was drawn
  pad?: (screenRow: number, i: number) => void; // the air around an item, as part of it
};

// tileList draws the window of a list and answers its lines and new top.
export function tileList<T>(s: TileListSpec<T>): { lines: Line[]; top: number } {
  // Drawn rows alternate air and items, with air after the last item and,
  // with lead, before the first; so item i is row 2i (2i + 1 with lead), and
  // only the rows on screen are worked out, however long the list.
  const lead = s.lead ? 1 : 0, n = s.items.length;
  const total = n === 0 ? 0 : 2 * n + lead;
  const itemAt = (at: number) => (at < 0 || at >= total ? undefined : (at - lead) % 2 === 0 ? (at - lead) / 2 : -1);
  const canTile = s.selected >= 0 && s.selected < n && (s.tile?.(s.items[s.selected]) ?? true);
  const selAt = canTile ? 2 * s.selected + lead : -9;
  const top = scrollTo(s.top, selAt, s.rows, total, s.follow);
  const lines: Line[] = [];
  for (let k = 0; k < s.rows; k++) {
    const at = top + k, i = itemAt(at), screen = s.at[0] + k;
    if (i === undefined) lines.push(blank(s.cols, s.base));
    else if (i < 0) {
      lines.push(at === selAt - 1 || at === selAt + 1 ? tileEdge(at === selAt - 1, s.cols, s.fill, s.base, screen, s.at[1]) : blank(s.cols, s.base));
      // The air belongs to the selected tile it edges, else to the tile below,
      // else to the one above.
      const tile = (j: number | undefined) => (j !== undefined && j >= 0 && (s.tile?.(s.items[j]) ?? true) ? j : undefined);
      const owner = at === selAt - 1 || at === selAt + 1 ? s.selected : (tile(itemAt(at + 1)) ?? tile(itemAt(at - 1)));
      if (owner !== undefined) s.pad?.(screen, owner);
    } else {
      const on = at === selAt;
      s.hit?.(screen, i);
      lines.push(row(s.cols, s.base, on ? s.fill : null, (l) => s.draw(l, s.items[i], i, on), true));
    }
  }
  return { lines, top };
}

// sectionHeader is a list's section title, with an optional count at the right.
export function sectionHeader(t: Theme, cols: number, base: RGB, title: string, count?: number, tone?: RGB): Line {
  return row(cols, base, null, (l) => {
    l.add(" " + title, tone ?? t.secondary, { bold: true });
    return count === undefined ? l : l.right(`${count} `, t.tertiary);
  });
}
