// Talks to the git CLI and parses what it prints. Reads never take the index
// lock, and git never stops to ask for a password or an editor.
import { run } from "../exec";

export const env = { GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_EDITOR: "true", LC_ALL: "C" };

export class GitError extends Error {}

const gitCmd = ["git", "-c", "core.quotepath=off", "-c", "color.ui=never"];

export async function git(cwd: string, args: string[], input?: string): Promise<string> {
  const r = await run([...gitCmd, ...args], { cwd, input, env });
  if (r.code !== 0) throw new GitError((r.err || r.out).trim() || `git ${args[0]} failed`);
  return r.out;
}

// gitMaybe answers git's output even when it exits 1, as diff --no-index does
// when the files differ.
export async function gitMaybe(cwd: string, args: string[]): Promise<string> {
  const r = await run([...gitCmd, ...args], { cwd, env });
  if (r.code > 1) throw new GitError((r.err || r.out).trim());
  return r.out;
}

export async function topLevel(dir: string): Promise<string> {
  return (await git(dir, ["rev-parse", "--show-toplevel"])).trim();
}

export async function gitDir(repo: string): Promise<string> {
  return (await git(repo, ["rev-parse", "--path-format=absolute", "--git-dir"])).trim();
}

// Unit and record separators split fields and records in git's formatted output.
export const US = "\x1f", RS = "\x1e";
