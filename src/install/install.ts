// qvist install puts qvist's Rex action in Rex's config, so ⇧⌘K opens the
// pane beside the focused one; qvist uninstall takes it out again.
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import actionLua from "./qvist.lua" with { type: "text" };
import { run } from "../exec";

const requireLine = `require("qvist")`;

function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  return xdg ? join(xdg, "rex") : join(homedir(), ".config", "rex");
}

// luaQuote writes s as a Lua string; a path may hold any byte but NUL.
const luaQuote = (s: string) => `"${s.replace(/[\\"\n\r]/g, (c) => ({ "\n": "\\n", "\r": "\\r" })[c] ?? "\\" + c)}"`;

function readFile(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

const isRequire = (l: string) => l.trim() === requireLine;

// install points the action at bin, the compiled qvist.
export async function install(bin: string): Promise<void> {
  if (basename(bin) === "bun") throw new Error("compile qvist first, with bun run build, then run bin/qvist install");
  const dir = configDir();
  mkdirSync(dir, { recursive: true });
  const luaPath = join(dir, "qvist.lua");
  writeFileSync(luaPath, `-- qvist install writes this file. Run it again after moving qvist.\nlocal BIN = ${luaQuote(bin)}\n${actionLua}`);
  console.log("wrote", luaPath);
  const initPath = join(dir, "init.lua");
  let s = readFile(initPath);
  if (!s.split("\n").some(isRequire)) {
    if (s !== "" && !s.endsWith("\n")) s += "\n";
    writeFileSync(initPath, s + requireLine + "\n");
    console.log(`added ${requireLine} to ${initPath}`);
  }
  await reload();
  console.log('press shift+cmd+k, or run "Toggle qvist" from the command palette');
}

export async function uninstall(): Promise<void> {
  const dir = configDir();
  try {
    unlinkSync(join(dir, "qvist.lua"));
    console.log("removed", join(dir, "qvist.lua"));
  } catch {}
  const initPath = join(dir, "init.lua");
  const s = readFile(initPath);
  if (s.split("\n").some(isRequire)) {
    writeFileSync(initPath, s.split("\n").filter((l) => !isRequire(l)).join("\n"));
    console.log(`removed ${requireLine} from ${initPath}`);
  }
  await reload();
}

async function reload(): Promise<void> {
  const r = await run(["rex", "config", "reload"]).catch(() => null);
  if (!r || r.code !== 0) console.log("reload Rex's config yourself with: rex config reload");
}
