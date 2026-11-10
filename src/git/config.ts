// Reading and writing git config, and who commits.
import { run } from "../exec";
import { env, git, gitDir, GitError, gitMaybe } from "./run";

export type Scope = "global" | "local" | "system";
export type Entry = { key: string; section: string; name: string; value: string; origin: string; overriddenBy: string };

const scopeFlag = (s: Scope) => (s === "local" ? "--local" : s === "system" ? "--system" : "--global");

// config lists one scope's entries, each noting the scope whose later value
// wins over it, as VS Code's settings say "Modified in".
export async function config(repo: string | null, scope: Scope): Promise<Entry[]> {
  const out = await gitMaybe(repo ?? process.env.HOME!, ["config", "--list", "--show-scope", "--show-origin", "-z"]);
  const f = out.split("\0");
  const all: { scope: string; origin: string; key: string; value: string }[] = [];
  for (let i = 0; i + 2 < f.length; i += 3) {
    const nl = f[i + 2].indexOf("\n");
    all.push({
      scope: f[i] === "unknown" ? "system" : f[i],
      origin: f[i + 1].replace(/^file:/, ""),
      key: nl < 0 ? f[i + 2] : f[i + 2].slice(0, nl),
      value: nl < 0 ? "" : f[i + 2].slice(nl + 1),
    });
  }
  // Walking back from the end, `later` holds each key's nearest later entry
  // from another scope, so every entry finds what overrides it in one pass.
  const entries: Entry[] = [];
  const later = new Map<string, string>();
  for (let i = all.length - 1; i >= 0; i--) {
    const e = all[i];
    if (e.scope !== scope) {
      later.set(e.key, e.scope);
      continue;
    }
    const dot = e.key.lastIndexOf(".");
    entries.push({ key: e.key, section: e.key.slice(0, dot), name: e.key.slice(dot + 1), value: e.value, origin: e.origin, overriddenBy: later.get(e.key) ?? "" });
  }
  entries.reverse();
  // The settings people change most come first, then the rest by name.
  const first = ["user", "core", "init", "pull", "push", "alias"];
  const rank = (s: string) => {
    const i = first.indexOf(s.split(".")[0]);
    return i < 0 ? first.length : i;
  };
  return entries.sort((a, b) => rank(a.section) - rank(b.section) || a.section.localeCompare(b.section));
}

export const setConfig = (repo: string | null, scope: Scope, key: string, value: string) =>
  git(repo ?? process.env.HOME!, ["config", scopeFlag(scope), key, value]);

export const unsetConfig = (repo: string | null, scope: Scope, key: string) =>
  git(repo ?? process.env.HOME!, ["config", scopeFlag(scope), "--unset-all", key]);

export async function configPath(repo: string | null, scope: Scope): Promise<string> {
  if (scope === "system") return "/etc/gitconfig";
  if (scope === "local") {
    if (!repo) throw new GitError("Open a repository to edit its config");
    return `${await gitDir(repo)}/config`;
  }
  return `${process.env.HOME}/.gitconfig`;
}

// Identity is who a commit here would be by: user.name and user.email as
// configured, each empty when it isn't set.
export type Identity = { name: string; email: string; scope: string; guessed: boolean };

export async function identity(repo: string): Promise<Identity> {
  const get = async (key: string) => {
    const r = await run(["git", "config", "--show-scope", "--get", key], { cwd: repo, env });
    if (r.code !== 0) return { scope: "", value: "" };
    const [scope, ...value] = r.out.trimEnd().split("\t");
    return { scope, value: value.join("\t") };
  };
  const [name, email] = await Promise.all([get("user.name"), get("user.email")]);
  return { name: name.value, email: email.value, scope: name.scope || email.scope, guessed: false };
}

// checkConfig reports why git can't read a config file, or "" when it can.
export async function checkConfig(path: string): Promise<string> {
  const r = await run(["git", "config", "--file", path, "--list"], { env });
  return r.code === 0 ? "" : (r.err || r.out).trim();
}
