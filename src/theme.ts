// Qvist wears the Rex theme of the pane it runs in. Rex ships its themes'
// design tokens in its app bundle; qvist reads them there at startup, picks
// the theme whose terminal background matches the pane's (OSC 11), and falls
// back to the theme Rex's settings name for that appearance, then to one
// derived from the background alone.
import { existsSync, readFileSync } from "node:fs";
import { run } from "./exec";

export type RGB = [r: number, g: number, b: number];

export type Theme = {
  id: string;
  dark: boolean;
  canvas: RGB; // the pane
  sidebar: RGB; // the changes list, as Rex's sidebar
  surface: RGB; // the diff's card: the canvas, so it shows Rex's glass
  raised: RGB; // headers and bars
  stroke: RGB;
  strokeSubtle: RGB;
  hover: RGB;
  selected: RGB;
  content: RGB;
  secondary: RGB;
  tertiary: RGB;
  accent: RGB;
  accentContainer: RGB;
  accentOnContainer: RGB;
  success: RGB;
  danger: RGB;
  warning: RGB;
  info: RGB;
  // The diff's, after Pierre: a line's tint is its colour 12% over the
  // background, its changed words 25%.
  addBg: RGB;
  delBg: RGB;
  addEmphasis: RGB;
  delEmphasis: RGB;
};

const bundles = [
  "/Applications/Rex Beta.app",
  "/Applications/Rex.app",
  `${process.env.HOME}/Applications/Rex Beta.app`,
  `${process.env.HOME}/Applications/Rex.app`,
];
const tokens = "Contents/Resources/SuperUI_SuperDesignTokens.bundle/Contents/Resources/themes.json";

type Color = { red: number; green: number; blue: number; alpha?: number };
type RexTheme = { id: string; appearance: "dark" | "light"; semantic: Record<string, Color> };

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as RGB;
}

export function luminance(c: RGB): number {
  return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
}

const distance = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// colorOf reads a colour such as rgb:1e1e/1e1e/2020, where each channel has
// one to four hex digits, as 8-bit channels.
export function colorOf(spec: string): RGB | null {
  if (!spec.startsWith("rgb:")) return null;
  const parts = spec.slice(4).split("/");
  if (parts.length !== 3 || parts.some((p) => !/^[0-9a-fA-F]{1,4}$/.test(p))) return null;
  return parts.map((p) => Math.round((parseInt(p, 16) / (2 ** (4 * p.length) - 1)) * 255)) as RGB;
}

// readThemes reads Rex's themes once; a change of theme picks among them again.
let themesRead: RexTheme[] | null = null;
function readThemes(): RexTheme[] {
  return (themesRead ??= readThemesFile());
}

function readThemesFile(): RexTheme[] {
  for (const app of bundles) {
    const path = `${app}/${tokens}`;
    if (!existsSync(path)) continue;
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch {}
  }
  return [];
}

async function preferredId(dark: boolean): Promise<string> {
  const key = dark ? "Workspace.darkThemeID" : "Workspace.lightThemeID";
  const r = await run(["defaults", "read", "com.superlogical.rex", key]).catch(() => ({ code: 1, out: "" }));
  return r.code === 0 ? r.out.trim() : "";
}

// gitOrange is Git's own orange, #F05032: qvist's accent in every theme.
const gitOrange: RGB = [240, 80, 50];

// fromRex turns a Rex theme's semantic tokens into qvist's, laying each
// translucent token over the canvas as Rex draws it.
function fromRex(t: RexTheme): Theme {
  const s = t.semantic;
  const canvas = rgb(s.terminalBackground ?? s.canvas);
  const at = (name: string, fallback: RGB): RGB => {
    const c = s[name];
    if (!c) return fallback;
    return mix(canvas, rgb(c), c.alpha ?? 1);
  };
  const content = at("content", [220, 220, 220]);
  return build(t.id, t.appearance === "dark", {
    canvas,
    sidebar: at("surfaceSubtle", canvas),
    raised: at("surfaceRaised", canvas),
    stroke: at("stroke", mix(canvas, content, 0.25)),
    strokeSubtle: at("strokeSubtle", mix(canvas, content, 0.15)),
    hover: at("controlHover", mix(canvas, content, 0.05)),
    selected: at("controlPressed", mix(canvas, content, 0.09)),
    content,
    secondary: at("contentSecondary", mix(canvas, content, 0.6)),
    tertiary: at("contentTertiary", mix(canvas, content, 0.45)),
    accent: gitOrange,
    accentContainer: mix(canvas, gitOrange, 0.2),
    accentOnContainer: gitOrange,
    success: at("success", [94, 204, 113]),
    danger: at("danger", [255, 103, 98]),
    warning: at("warning", [255, 212, 82]),
    info: at("info", [105, 177, 255]),
  });
}

function rgb(c: Color): RGB {
  return [Math.round(c.red * 255), Math.round(c.green * 255), Math.round(c.blue * 255)];
}

type Base = Omit<Theme, "id" | "dark" | "surface" | "addBg" | "delBg" | "addEmphasis" | "delEmphasis">;

function build(id: string, dark: boolean, b: Base): Theme {
  return {
    id,
    dark,
    ...b,
    surface: b.canvas,
    addBg: mix(b.canvas, b.success, 0.12),
    delBg: mix(b.canvas, b.danger, 0.12),
    addEmphasis: mix(b.canvas, b.success, 0.25),
    delEmphasis: mix(b.canvas, b.danger, 0.25),
  };
}

// derived is the theme for a terminal Rex didn't theme: Pierre's colours on
// the pane's own background and foreground.
function derived(bg: RGB, fg: RGB): Theme {
  const dark = luminance(bg) <= 0.5;
  const accent = gitOrange;
  return build("terminal", dark, {
    canvas: bg,
    sidebar: mix(bg, fg, 0.04),
    raised: mix(bg, fg, 0.07),
    stroke: mix(bg, fg, 0.22),
    strokeSubtle: mix(bg, fg, 0.12),
    hover: mix(bg, fg, 0.05),
    selected: mix(bg, fg, 0.09),
    content: fg,
    secondary: mix(bg, fg, 0.62),
    tertiary: mix(bg, fg, 0.42),
    accent,
    accentContainer: mix(bg, accent, 0.2),
    accentOnContainer: accent,
    success: dark ? [94, 204, 113] : [13, 190, 78],
    danger: dark ? [255, 103, 98] : [255, 46, 63],
    warning: dark ? [255, 212, 82] : [213, 169, 16],
    info: dark ? [105, 177, 255] : [0, 159, 255],
  });
}

// pickTheme chooses the pane's theme from its background and foreground, as
// the terminal reported them (null when it didn't).
// Palette is the terminal's own ANSI colours, where it answered for them.
export type Palette = { red?: RGB; green?: RGB; yellow?: RGB; blue?: RGB };

// pickTheme picks the theme, then wears the terminal's palette over it.
export async function pickTheme(bg: RGB | null, fg: RGB | null, palette: Palette = {}): Promise<Theme> {
  const t = await pickBase(bg, fg);
  return build(t.id, t.dark, {
    ...t,
    success: palette.green ?? t.success,
    danger: palette.red ?? t.danger,
    warning: palette.yellow ?? t.warning,
    info: palette.blue ?? t.info,
  });
}

async function pickBase(bg: RGB | null, fg: RGB | null): Promise<Theme> {
  const background = bg ?? [0, 0, 0];
  const dark = luminance(background) <= 0.5;
  const themes = readThemes();
  if (themes.length > 0) {
    let best: RexTheme | null = null;
    let bestDistance = Infinity;
    for (const t of themes) {
      const tb = t.semantic.terminalBackground ?? t.semantic.canvas;
      if (!tb) continue;
      const d = distance(rgb(tb), background);
      if (d < bestDistance) [best, bestDistance] = [t, d];
    }
    if (best && bg && bestDistance < 4) return fromRex(best);
    if (!bg) {
      const id = await preferredId(dark);
      const named = themes.find((t) => t.id === id) ?? themes.find((t) => t.appearance === (dark ? "dark" : "light"));
      if (named) return fromRex(named);
    }
  }
  return derived(background, fg ?? (dark ? [230, 230, 230] : [28, 28, 30]));
}

// The clear colours are drawn as the terminal's default background, which
// Rex's glass shows through: the canvas, and the sidebar, whose tint the
// cards lay over the glass as a translucent image under the text instead.
// Where the pane is opaque the canvas is the default background anyway.
let clear: RGB[] = [];
export function wear(t: Theme): void {
  clear = [t.canvas, t.sidebar];
}
export const isClear = (c: RGB) => clear.some((k) => k[0] === c[0] && k[1] === c[1] && k[2] === c[2]);

// sgr helpers: foreground, background, and resetting both.
export const fg = (c: RGB) => `\x1b[38;2;${c[0]};${c[1]};${c[2]}m`;
export const bg = (c: RGB) => (isClear(c) ? "\x1b[49m" : `\x1b[48;2;${c[0]};${c[1]};${c[2]}m`);
export const hexOf = (h: string): RGB => {
  const n = parseInt(h.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
