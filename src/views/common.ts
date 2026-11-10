// What the screens share: the body's size, file rows and status colours.
import type { App } from "../app/app";
import { fileIcon } from "../ui/icons";
import { bg, type RGB } from "../theme";
import { Line } from "../ui/line";
import { clip } from "../ui/text";

// The body is the pane less its header, footer and side margins.
export const bodyRows = (a: App) => a.size.rows - 2;
export const bodyCols = (a: App) => a.size.cols - 2;

export const beside = (a: App, l: string[], r: string[]) => l.map((s, i) => `${s}${bg(a.theme.canvas)} ${r[i]}`);

export const codeColor = (a: App, code: string): RGB => {
  const t = a.theme;
  return code === "A" || code === "U" ? t.success : code === "D" ? t.danger : code === "!" ? t.warning : code === "R" ? t.info : t.warning;
};

// fileRow draws a file: its icon and name, its folder dimmed, and its status
// letter at the right.
export function fileRow(a: App, l: Line, path: string, code: string, on: boolean, folder = true, indent = 0): Line {
  const t = a.theme, [icon, tone] = fileIcon(path, t);
  const slash = path.lastIndexOf("/");
  const name = folder ? path.slice(slash + 1) : path, dir = folder && slash >= 0 ? path.slice(0, slash) : "";
  l.pad(indent).add(" " + icon + " ", tone).add(clip(name, l.left - 4), code === "D" ? t.secondary : t.content, { bold: on });
  if (dir && l.left > 8) l.add("  " + clip(dir, l.left - 6), t.tertiary);
  return l.right(` ${code} `, codeColor(a, code), { bold: true });
}
