// File-type icons, from the Nerd Font symbols Rex's terminal draws itself.
import type { RGB, Theme } from "../theme";

const byExt: Record<string, [glyph: string, tone: keyof Theme]> = {
  ts: ["", "info"], tsx: ["", "info"], mts: ["", "info"],
  js: ["", "warning"], jsx: ["", "info"], mjs: ["", "warning"], cjs: ["", "warning"],
  json: ["", "warning"], md: ["", "secondary"], mdx: ["", "secondary"],
  swift: ["", "danger"], rs: ["", "warning"], go: ["", "info"], py: ["", "info"],
  rb: ["", "danger"], lua: ["", "info"], sh: ["", "success"], zsh: ["", "success"],
  css: ["", "info"], scss: ["", "danger"], html: ["", "danger"], svg: ["", "warning"],
  png: ["", "accent"], jpg: ["", "accent"], gif: ["", "accent"], webp: ["", "accent"],
  yml: ["", "danger"], yaml: ["", "danger"], toml: ["", "secondary"], lock: ["", "tertiary"],
  proto: ["", "secondary"], txt: ["", "secondary"], c: ["", "info"], h: ["", "accent"],
  cpp: ["", "info"], java: ["", "danger"], kt: ["", "accent"], sql: ["", "secondary"],
};

const byName: Record<string, [string, keyof Theme]> = {
  "package.json": ["", "danger"], "bun.lock": ["", "tertiary"], ".gitignore": ["", "danger"],
  "Dockerfile": ["", "info"], "LICENSE": ["", "warning"], "Makefile": ["", "secondary"],
};

export const branchIcon = "";
export const commitIcon = "";

export function fileIcon(path: string, t: Theme): [string, RGB] {
  const name = path.slice(path.lastIndexOf("/") + 1);
  if (path.endsWith("/")) return ["", t.secondary];
  const hit = byName[name] ?? byExt[name.slice(name.lastIndexOf(".") + 1).toLowerCase()];
  return hit ? [hit[0], t[hit[1]] as RGB] : ["", t.tertiary];
}
export const repoIcon = "\uf401";
