// Rasterises the commit graph for a window of rows: anti-aliased lines,
// lane changes as horizontal steps with small rounded turns, and a dot per commit, on a transparent background
// so each row's highlight shows through.
import type { Graph } from "../model/graph";
import type { RGB } from "../theme";

export type GraphPicture = { pix: Uint8Array; width: number; height: number };

// Geometry places the window: its first commit and how many, rows per
// commit, the cell size in pixels, lane width in cells, the HEAD commit's
// index, and the picture's width in cells, which it fills exactly so the
// terminal never stretches it.
type Geometry = { top: number; count: number; rowsPer: number; cellW: number; cellH: number; laneCols: number; head: number; cols: number };

export function drawGraph(g: Graph, geo: Geometry, colors: RGB[], ring: RGB): GraphPicture {
  const { top, count, rowsPer, cellW, cellH, laneCols } = geo;
  const laneW = laneCols * cellW;
  const width = Math.max(1, Math.round(geo.cols * cellW));
  const height = Math.max(1, Math.round(count * rowsPer * cellH));
  const pix = new Uint8Array(width * height * 4);
  const stroke = Math.max(1.5, cellW / 6);
  const x = (lane: number) => cellW / 2 + (lane + 0.5) * laneW;
  const y = (k: number) => ((k - top) * rowsPer + 0.5) * cellH;

  // blend lays a colour over a pixel with coverage a.
  const blend = (px: number, py: number, c: RGB, a: number) => {
    if (px < 0 || py < 0 || px >= width || py >= height || a <= 0) return;
    const i = (py * width + px) * 4, old = pix[i + 3] / 255, na = a + old * (1 - a);
    for (let k = 0; k < 3; k++) pix[i + k] = Math.round((c[k] * a + pix[i + k] * old * (1 - a)) / na);
    pix[i + 3] = Math.round(na * 255);
  };

  // line draws a thick segment, its coverage from the distance to it.
  const line = (x0: number, y0: number, x1: number, y1: number, c: RGB) => {
    const r = stroke / 2;
    const [minX, maxX] = [Math.floor(Math.min(x0, x1) - r - 1), Math.ceil(Math.max(x0, x1) + r + 1)];
    const [minY, maxY] = [Math.floor(Math.min(y0, y1) - r - 1), Math.ceil(Math.max(y0, y1) + r + 1)];
    const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy || 1;
    for (let py = Math.max(0, minY); py <= Math.min(height - 1, maxY); py++) {
      for (let px = Math.max(0, minX); px <= Math.min(width - 1, maxX); px++) {
        const t = Math.max(0, Math.min(1, ((px + 0.5 - x0) * dx + (py + 0.5 - y0) * dy) / len2));
        const d = Math.hypot(px + 0.5 - (x0 + t * dx), py + 0.5 - (y0 + t * dy));
        const a = Math.min(1, Math.max(0, r + 0.5 - d));
        if (a > 0) blend(px, py, c, a);
      }
    }
  };

  // step draws a line that leaves (x0, y0) and arrives at (x1, y1)
  // vertically, switching lanes with a horizontal run halfway down, its two
  // turns rounded with a small radius: the boxy look of a circuit.
  const step = (x0: number, y0: number, x1: number, y1: number, c: RGB) => {
    if (Math.abs(x0 - x1) < 0.5) return line(x0, y0, x1, y1, c);
    const my = (y0 + y1) / 2, dir = Math.sign(x1 - x0);
    const r = Math.min(cellW * 1.2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 4);
    // arc draws a quarter circle around (cx, cy) from angle a0 to a1.
    const arc = (cx: number, cy: number, a0: number, a1: number) => {
      const n = 8;
      let [px, py] = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)];
      for (let i = 1; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n, qx = cx + r * Math.cos(a), qy = cy + r * Math.sin(a);
        line(px, py, qx, qy, c);
        [px, py] = [qx, qy];
      }
    };
    line(x0, y0, x0, my - r, c);
    // Down, then turning towards x1.
    arc(x0 + dir * r, my - r, dir > 0 ? Math.PI : 0, Math.PI / 2);
    line(x0 + dir * r, my, x1 - dir * r, my, c);
    // Across, then turning down.
    arc(x1 - dir * r, my + r, -Math.PI / 2, dir > 0 ? 0 : -Math.PI);
    line(x1, my + r, x1, y1, c);
  };

  const disc = (cx: number, cy: number, r: number, c: RGB, hollow: boolean) => {
    for (let py = Math.floor(cy - r - 1); py <= Math.ceil(cy + r + 1); py++) {
      for (let px = Math.floor(cx - r - 1); px <= Math.ceil(cx + r + 1); px++) {
        const d = Math.hypot(px + 0.5 - cx, py + 0.5 - cy);
        const outer = Math.min(1, Math.max(0, r + 0.5 - d));
        if (outer <= 0) continue;
        if (hollow) {
          const inner = Math.min(1, Math.max(0, r - stroke + 0.5 - d));
          blend(px, py, c, outer - inner);
          if (inner > 0) blend(px, py, ring, inner);
        } else {
          blend(px, py, c, outer);
        }
      }
    }
  };

  const color = (n: number) => colors[n % colors.length];
  // Lines first, from the row above the window to the row below it, so they
  // run off its edges; then the dots over them.
  for (let k = Math.max(0, top - 1); k < Math.min(g.rows.length, top + count); k++) {
    for (const e of g.rows[k].down) step(x(e.from), y(k), x(e.to), y(k + 1), color(e.color));
  }
  const dot = Math.min(cellH * 0.26, laneW * 0.29);
  for (let k = top; k < Math.min(g.rows.length, top + count); k++) {
    const r = g.rows[k];
    disc(x(r.lane), y(k), r.merge ? dot * 0.8 : dot, color(r.color), k === geo.head);
  }
  return { pix, width, height };
}
