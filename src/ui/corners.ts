// Rounds the cards' corners. A terminal cell is square, so each corner is a
// one-cell image (kitty graphics protocol, which Rex's terminal speaks): an
// anti-aliased quarter circle of the card's colour on the colour around it.
// Each distinct corner is sent once and then placed wherever it is needed.
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cellHeight, cellWidth, type Size } from "../terminal/term";
import { isClear, type RGB } from "../theme";

// Which corner, as the card's top or bottom edge row draws it; or a piece
// of a tinted card's top or bottom edge or its left or right side, drawn
// once and stretched over the cells it spans.
export type Corner = "tl" | "tr" | "bl" | "br" | "t" | "b" | "l" | "r";

// A placement covers `span` cells across (an edge) or down (a side); alpha is
// how opaque its fill is, when that is a translucent tint.
export type Placement = { row: number; col: number; corner: Corner; fill: RGB; outer: RGB; span?: number; alpha?: number };

const sent = new Map<string, number>();
const maxSent = 200;
let nextId = 7000;

// supported reports whether the terminal told us its cell size in pixels,
// which drawing to the pixel needs.
export const supported = (s: Size) => s.width > 0 && s.height > 0;

// image draws a corner cell: the card fills the half of the cell nearest
// the card's body (its top and bottom edges are half a row), rounded with a
// radius as large as that half allows.
function image(corner: Corner, w: number, h: number, fill: RGB, outer: RGB, alpha = 1): Uint8Array {
  const pix = new Uint8Array(w * h * 4);
  const r = Math.min(w, h / 2);
  const side = corner === "l" || corner === "r";
  const top = corner[0] === "t", bottom = corner[0] === "b";
  const left = corner.endsWith("l"), right = corner.endsWith("r");
  const arc = corner.length === 2;
  // The arc's centre, in the cell's pixels.
  const cx = left ? r : w - r;
  const cy = top ? h / 2 + r : h / 2 - r;
  const inside = (px: number, py: number) => {
    if (!side && top && py < h / 2) return false;
    if (!side && bottom && py > h / 2) return false;
    const beyondX = left ? px < cx : px > cx, beyondY = top ? py < cy : py > cy;
    return !(arc && beyondX && beyondY && Math.hypot(px - cx, py - cy) > r);
  };
  // A clear outside covers nothing, so the glass or the tint under it shows
  // there; a tinted fill covers by its alpha.
  const outerAlpha = isClear(outer) ? 0 : 1;
  const n = 4; // samples per axis
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let card = 0;
      for (let sy = 0; sy < n; sy++) for (let sx = 0; sx < n; sx++) if (inside(x + (sx + 0.5) / n, y + (sy + 0.5) / n)) card++;
      // Each pixel mixes the outside and the card's fill by how much of it
      // each covers.
      const f = (card / (n * n)) * alpha, o = (1 - card / (n * n)) * outerAlpha, a = o + f, i = (y * w + x) * 4;
      for (let k = 0; k < 3; k++) pix[i + k] = a > 0 ? Math.round((outer[k] * o + fill[k] * f) / a) : 0;
      pix[i + 3] = Math.round(a * 255);
    }
  }
  return pix;
}

// transmit sends an image once, in chunks of base64 as the protocol asks.
function transmit(id: number, pix: Uint8Array, w: number, h: number): string {
  const data = Buffer.from(pix).toString("base64");
  let out = "";
  for (let i = 0; i < data.length; i += 4096) {
    const more = i + 4096 < data.length ? 1 : 0;
    const head = i === 0 ? `a=t,q=2,f=32,s=${w},v=${h},i=${id},m=${more}` : `m=${more}`;
    out += `\x1b_G${head};${data.slice(i, i + 4096)}\x1b\\`;
  }
  return out;
}

// Strip is a tall image shown through a window of cells, such as the commit
// graph: drawn in tiles of `tile` rows of items, each sent to the terminal
// once, so scrolling only moves which part of them is placed. An item takes
// `per` text rows; the window shows items top .. top+shown at (row, col).
export type Strip = {
  key: string;
  tile: number;
  per: number;
  top: number;
  shown: number;
  row: number;
  col: number;
  cols: number;
  draw: (first: number, count: number, cellW: number, cellH: number) => { pix: Uint8Array; width: number; height: number };
};

const stripBase = 9100;
let stripKey = "";
const stripSent = new Set<number>();

function sendTile(id: number, img: { pix: Uint8Array; width: number; height: number }): string {
  const path = join(tmpdir(), `tty-graphics-protocol-qvist-${randomBytes(6).toString("hex")}.raw`);
  writeFileSync(path, img.pix, { flag: "wx", mode: 0o600 });
  return `\x1b_Ga=t,q=2,f=32,t=t,s=${img.width},v=${img.height},i=${id};${Buffer.from(path).toString("base64")}\x1b\\`;
}

// placeStrip answers the tiles the window needs that aren't sent yet, and
// the placements of each one's visible part.
function placeStrip(st: Strip, w: number, h: number): [send: string, place: string] {
  let out = "", place = "";
  const key = `${st.key}:${w}x${h}:${st.tile}:${st.per}`;
  if (key !== stripKey) {
    for (const id of stripSent) out += `\x1b_Ga=d,d=I,q=2,i=${id}\x1b\\`;
    stripSent.clear();
    stripKey = key;
  }
  const rowPx = st.per * h;
  for (let item = st.top; item < st.top + st.shown; ) {
    const t = Math.floor(item / st.tile), id = stripBase + t;
    const end = Math.min(st.top + st.shown, (t + 1) * st.tile);
    if (!stripSent.has(id)) {
      out += sendTile(id, st.draw(t * st.tile, st.tile, w, h));
      stripSent.add(id);
    }
    const y = (item - t * st.tile) * rowPx, rows = (end - item) * st.per;
    place += `\x1b[${st.row + (item - st.top) * st.per + 1};${st.col + 1}H\x1b_Ga=p,q=2,i=${id},p=1,x=0,y=${y},w=${st.cols * w},h=${rows * h},c=${st.cols},r=${rows},z=1,C=1\x1b\\`;
    item = end;
  }
  return [out, place];
}

// Wash is a card's translucent tint over `rows` by `cols` cells at (row,
// col): one pixel of its colour, stretched under the text and under every
// cell with a background of its own, so only the clear cells show it.
export type Wash = { row: number; col: number; rows: number; cols: number; color: RGB; alpha: number };
const washZ = -1073741825;

// The placements last sent, so a frame whose images are where they were
// sends none.
let lastPlaced = "";

// render answers the escapes that put every corner of this frame in place,
// and its strip, after removing last frame's, sending any image not sent yet;
// or nothing, when every image is already where this frame wants it.
export function render(size: Size, corners: Placement[], strip: Strip | null = null, washes: Wash[] = []): string {
  const clear = "\x1b_Ga=d,d=a,q=2\x1b\\";
  if (!supported(size)) {
    const had = lastPlaced;
    lastPlaced = "";
    return had ? clear : "";
  }
  let out = "", place = "";
  const w = Math.round(cellWidth(size)), h = Math.round(cellHeight(size));
  // Each theme brings its own corners; once enough have piled up, free them
  // in the terminal too and send again only what is still in use.
  if (sent.size > maxSent) {
    for (const id of sent.values()) out += `\x1b_Ga=d,d=I,q=2,i=${id}\x1b\\`;
    sent.clear();
    // Ids start over, so they never climb into the strip's from 9100.
    nextId = 7000;
  }
  corners.forEach((c, k) => {
    const key = `${c.corner}:${c.fill}:${c.outer}:${isClear(c.outer)}:${c.alpha ?? 1}:${w}x${h}`;
    let id = sent.get(key);
    if (id === undefined) {
      id = nextId++;
      sent.set(key, id);
      out += transmit(id, image(c.corner, w, h, c.fill, c.outer, c.alpha), w, h);
    }
    const across = c.corner === "t" || c.corner === "b" ? (c.span ?? 1) : 1, down = c.corner === "l" || c.corner === "r" ? (c.span ?? 1) : 1;
    place += `\x1b[${c.row + 1};${c.col + 1}H\x1b_Ga=p,q=2,i=${id},p=${k + 1},c=${across},r=${down},z=1,C=1\x1b\\`;
  });
  washes.forEach((c, k) => {
    const key = `wash:${c.color}:${c.alpha}`;
    let id = sent.get(key);
    if (id === undefined) {
      id = nextId++;
      sent.set(key, id);
      out += transmit(id, new Uint8Array([...c.color, Math.round(c.alpha * 255)]), 1, 1);
    }
    place += `\x1b[${c.row + 1};${c.col + 1}H\x1b_Ga=p,q=2,i=${id},p=${corners.length + k + 1},c=${c.cols},r=${c.rows},z=${washZ},C=1\x1b\\`;
  });
  if (strip && strip.shown > 0) {
    const [send, at] = placeStrip(strip, w, h);
    [out, place] = [out + send, place + at];
  }
  // Images sent or freed this frame need placing again, even where they were.
  if (place === lastPlaced && out === "") return "";
  lastPlaced = place;
  return clear + out + place;
}

// forget drops every sent image, as after the terminal was reset.
export function forget(): void {
  sent.clear();
  lastPlaced = "";
  stripKey = "";
  stripSent.clear();
}
