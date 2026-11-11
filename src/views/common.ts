// What the screens share: the body's size, file rows and status colours.
import type { App } from "../app/app";
import { fileIcon } from "../ui/icons";
import { bg, type RGB } from "../theme";
import { Line } from "../ui/line";
import { clip, width } from "../ui/text";

// The body is the pane less its header, footer and side margins.
export const bodyRows = (a: App) => a.size.rows - 2;
export const bodyCols = (a: App) => a.size.cols - 2;

export const beside = (a: App, l: string[], r: string[]) => l.map((s, i) => `${s}${bg(a.theme.canvas)} ${r[i]}`);

export const codeColor = (a: App, code: string): RGB => {
  const t = a.theme;
  return code === "A" || code === "U" ? t.success : code === "D" ? t.danger : code === "!" ? t.warning : code === "R" ? t.info : t.warning;
};

// stageGlyph is the button that stages a file, or unstages it once staged.
export const stageGlyph = (staged: boolean) => (staged ? "−" : "+");

// fileRow draws a file: its icon and name, its folder dimmed, and its status
// letter at the right, then a button's glyph when it has one.
export function fileRow(a: App, l: Line, path: string, code: string, on: boolean, folder = true, indent = 0, button = ""): Line {
  const t = a.theme, [icon, tone] = fileIcon(path, t);
  const slash = path.lastIndexOf("/");
  const name = folder ? path.slice(slash + 1) : path, dir = folder && slash >= 0 ? path.slice(0, slash) : "";
  const room = button ? 3 : 0;
  l.pad(indent).add(" " + icon + " ", tone).add(clip(name, l.left - 4 - room), code === "D" ? t.secondary : t.content, { bold: on });
  if (dir && l.left > 8 + room) l.add("  " + clip(dir, l.left - 6 - room), t.tertiary);
  const status = ` ${code} `;
  l.pad(l.left - width(status) - room).add(status, codeColor(a, code), { bold: true });
  return button ? l.add(` ${button} `, on ? t.content : t.secondary, { bold: true }) : l;
}
