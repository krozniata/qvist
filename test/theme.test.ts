import { describe, expect, test } from "bun:test";
import { bg, colorOf, isClear, pickTheme, wear } from "../src/theme";
import { begin, card, render } from "../src/ui/frame";
import { blank, Line, Rounded } from "../src/ui/line";

const dark = [7, 16, 27] as const, light = [188, 204, 216] as const;
const theme = async () => {
  const t = await pickTheme([...dark], [...light]);
  wear(t);
  return t;
};
// A pane that reports its cell size, so cards are drawn with images.
const pane = { cols: 80, rows: 24, width: 800, height: 480 };

describe("colorOf", () => {
  test("reads a terminal's colour reply at any channel width", () => {
    expect(colorOf("rgb:ffff/8080/0000")).toEqual([255, 128, 0]);
    expect(colorOf("rgb:f/8/0")).toEqual([255, 136, 0]);
    expect(colorOf("rgb:1e/1e/20")).toEqual([30, 30, 32]);
    expect(colorOf("#ffffff")).toBeNull();
    expect(colorOf("rgb:ff/ff")).toBeNull();
  });
});

describe("pickTheme", () => {
  test("wears the terminal's own palette for its status colours", async () => {
    const t = await pickTheme([...dark], [...light], { green: [1, 2, 3], red: [4, 5, 6] });
    expect([t.success, t.danger]).toEqual([[1, 2, 3], [4, 5, 6]]);
    expect(t.dark).toBe(true);
  });

  test("draws the diff on the pane's own canvas", async () => {
    const t = await theme();
    expect(t.surface).toEqual(t.canvas);
  });
});

describe("glass", () => {
  test("leaves the canvas and the sidebar on the terminal's default background", async () => {
    const t = await theme();
    expect(bg(t.canvas)).toBe("\x1b[49m");
    expect(bg(t.sidebar)).toBe("\x1b[49m");
    expect(bg(t.selected)).toMatch(/^\x1b\[48;2;/);
    expect(isClear(t.accent)).toBe(false);
  });

  test("tints a card with a translucent image under its text, stronger with focus", async () => {
    const t = await theme();
    begin(pane, t.sidebar);
    const rows = card([blank(8, t.sidebar)], 10, 3, t.sidebar, t.canvas, [0, 0], true);
    card([blank(8, t.surface)], 10, 3, t.surface, t.canvas, [0, 11], false);
    // No cell of the card paints a background of its own.
    expect(rows.join("")).not.toMatch(/\x1b\[48;/);
    const out = render(pane);
    const under = [...out.matchAll(/c=8,r=1,z=(-\d+)/g)];
    expect(under.length).toBe(2);
    expect(Number(under[0][1])).toBeLessThan(-1073741824);
    const tints = [...out.matchAll(/s=1,v=1,i=\d+,m=0;([^\x1b]*)/g)].map((m) => [...Buffer.from(m[1], "base64")]);
    expect(tints.map((p) => p.slice(0, 3))).toEqual([t.sidebar, t.sidebar]);
    const [focused, resting] = tints.map((p) => p[3]);
    expect(focused).toBeGreaterThan(resting);
    expect(resting).toBeGreaterThan(0);
  });

  test("draws a pill's ends on a clear fill as blanks, not as ink", async () => {
    const t = await theme();
    const fold = new Rounded(new Line(6, t.surface).add("⋯", t.tertiary), t.surface).toString();
    expect(fold).not.toContain("");
    expect(new Rounded(new Line(6, t.selected), t.surface).toString()).toContain("");
  });
});

describe("Line", () => {
  test("never lets a repository's text send the terminal commands", () => {
    // A commit subject that would write the clipboard and retitle the pane.
    const subject = "fix typo\x1b]52;c;Y3VybCBldmlsLnNoIHwgc2g=\x07\x1b]0;pwned\x07\x9b2J";
    const out = new Line(80, [0, 0, 0]).add(subject, [255, 255, 255]).toString();
    expect(out).toContain("fix typo�]52;c;");
    // Only the line's own colour codes remain.
    expect(out.replace(/\x1b\[[0-9;]*m/g, "")).not.toMatch(/[\x00-\x1f\x7f-\x9f]/);
  });

  test("keeps a line's width when it shows control characters", () => {
    const l = new Line(10, [0, 0, 0]).add("a\x1bb", [255, 255, 255]);
    expect(l.left).toBe(7);
  });
});
