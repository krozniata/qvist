// What one frame draws besides text: the rounded corners of cards and tiles,
// and the commit graph's strip. Shapes add to it as they are drawn; the
// frame then renders them all, after the text, as kitty images.
import * as corners from "./corners";
import type { Size } from "../terminal/term";
import { bg, fg, isClear, type RGB } from "../theme";
import { blank, type Line, Padded, Raw } from "./line";

let placed: corners.Placement[] = [];
let washes: corners.Wash[] = [];
let strip: corners.Strip | null = null;
let round = false;
// tint is what a card with a clear fill is tinted with, laid over the glass
// as a translucent image: stronger on the card that has focus, so focus
// shows as that card lifting forward.
let tint: RGB = [0, 0, 0];
const lifted = 0.5, resting = 0.18;

export function begin(size: Size, cardTint: RGB): void {
  placed = [];
  washes = [];
  strip = null;
  round = corners.supported(size);
  tint = cardTint;
}

export function setStrip(s: corners.Strip | null): void {
  strip = s;
}

// hide drops the images that fall inside a rectangle, since images draw over
// text and would cover an overlay there; the strip goes too if it overlaps.
export function hide(rect: [row: number, col: number, rows: number, cols: number]): void {
  const [r, c, h, w] = rect;
  // A tint's edge or side spans cells: it goes if any of them is inside.
  const overlaps = (p: corners.Placement) => {
    const across = p.corner === "t" || p.corner === "b" ? (p.span ?? 1) : 1, down = p.corner === "l" || p.corner === "r" ? (p.span ?? 1) : 1;
    return p.row < r + h && p.row + down > r && p.col < c + w && p.col + across > c;
  };
  placed = placed.filter((p) => !overlaps(p));
  if (strip && strip.col < c + w && strip.col + strip.cols > c) strip = null;
}

export function render(size: Size): string {
  return corners.render(size, placed, strip, washes);
}

// forget drops what the terminal was sent, after something cleared it.
export const forget = corners.forget;

// edge draws a top or bottom edge `cols` wide at screen (row, col): half a
// row of fill with its two corners rounded images, or quadrant blocks where
// the terminal can't draw images.
// A clear fill is the default background, which no block can draw: its half
// row is an image too, of the card's tint at alpha.
export function edge(top: boolean, cols: number, fill: RGB, outer: RGB, row: number, col: number, alpha?: number): string {
  const mid = (isClear(fill) ? " " : top ? "▄" : "▀").repeat(Math.max(0, cols - 2));
  if (round) {
    const shade = alpha === undefined ? { fill } : { fill: tint, alpha };
    placed.push({ row, col, corner: top ? "tl" : "bl", outer, ...shade }, { row, col: col + cols - 1, corner: top ? "tr" : "br", outer, ...shade });
    if (alpha !== undefined && cols > 2) placed.push({ row, col: col + 1, corner: top ? "t" : "b", outer, ...shade, span: cols - 2 });
    return `${bg(outer)} ${fg(fill)}${mid}${bg(outer)} `;
  }
  if (isClear(fill)) return `${bg(outer)} ${mid} `;
  return `${bg(outer)}${fg(fill)}${top ? "▗" : "▝"}${mid}${top ? "▖" : "▘"}`;
}

// tileEdge is a tile's edge inside a list or card: `cols` wide with its
// inset, the edge itself starting a column in at screen (row, col + 1).
export function tileEdge(top: boolean, cols: number, fill: RGB, base: RGB, row: number, col: number): Line {
  return new Padded(new Raw(edge(top, cols - 2, fill, base, row, col + 1), cols - 2, base), base);
}

// card frames rows of content (each `cols - 2` wide, on fill) in a card
// `cols` wide and `rows` tall at screen (row, col): a soft top edge, a
// column of padding each side, and a soft bottom edge. A clear fill is the
// tint, laid under the rows, lifted where the card has focus.
export function card(content: Line[], cols: number, rows: number, fill: RGB, outer: RGB, at: [row: number, col: number], focused = true): string[] {
  const alpha = isClear(fill) ? (focused ? lifted : resting) : undefined;
  const out = [edge(true, cols, fill, outer, at[0], at[1], alpha)];
  for (let i = 0; i < rows - 2; i++) out.push(`${bg(fill)} ${(content[i] ?? blank(cols - 2, fill)).toString()}${bg(fill)} `);
  out.push(edge(false, cols, fill, outer, at[0] + rows - 1, at[1], alpha));
  // The tint lies under the rows; the sides are images, as the edges are, so
  // their columns aren't tinted twice.
  if (round && alpha !== undefined && rows > 2) {
    if (cols > 2) washes.push({ row: at[0] + 1, col: at[1] + 1, rows: rows - 2, cols: cols - 2, color: tint, alpha });
    placed.push({ row: at[0] + 1, col: at[1], corner: "l", fill: tint, outer, alpha, span: rows - 2 }, { row: at[0] + 1, col: at[1] + cols - 1, corner: "r", fill: tint, outer, alpha, span: rows - 2 });
  }
  return out;
}
