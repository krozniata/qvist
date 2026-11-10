// What the work tree and index hold against HEAD, and where the branch is
// against its upstream.
import { run } from "../exec";
import { env, git } from "./run";

// Code is VS Code's letter: Modified, Added, Deleted, Renamed, Untracked, or
// ! for a conflict.
export type Change = { path: string; code: string; staged: boolean; from?: string };

export type Status = {
  branch: string;
  upstream: string;
  ahead: number;
  behind: number;
  detached: boolean;
  staged: Change[];
  changes: Change[];
};

export async function status(repo: string): Promise<Status> {
  const out = await git(repo, ["status", "--porcelain=v1", "-z", "--branch", "--untracked-files=all"]);
  const parts = out.split("\0");
  const s: Status = { branch: "", upstream: "", ahead: 0, behind: 0, detached: false, staged: [], changes: [] };
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p === "") continue;
    if (p.startsWith("## ")) {
      const [head, track = ""] = p.slice(3).split(" [");
      const name = head.replace(/^(No commits yet on|Initial commit on) /, "");
      [s.branch, s.upstream = ""] = name.split("...");
      s.detached = s.branch.startsWith("HEAD (no branch)");
      if (s.detached) s.branch = "detached";
      s.ahead = Number(/ahead (\d+)/.exec(track)?.[1] ?? 0);
      s.behind = Number(/behind (\d+)/.exec(track)?.[1] ?? 0);
      continue;
    }
    const x = p[0], y = p[1], path = p.slice(3);
    let from: string | undefined;
    if (x === "R" || x === "C") from = parts[++i];
    if (x === "?") {
      s.changes.push({ path, code: "U", staged: false });
    } else if (x === "U" || y === "U" || (x === "A" && y === "A") || (x === "D" && y === "D")) {
      s.changes.push({ path, code: "!", staged: false });
    } else {
      if (x !== " ") s.staged.push({ path, code: x === "C" ? "A" : x, staged: true, from });
      if (y !== " ") s.changes.push({ path, code: y, staged: false });
    }
  }
  const byPath = (a: Change, b: Change) => a.path.localeCompare(b.path);
  s.staged.sort(byPath);
  s.changes.sort(byPath);
  return s;
}

// allIgnored answers whether git ignores every one of paths, so that a change
// to them can't show in the status. Tracked files never count as ignored.
export async function allIgnored(repo: string, paths: string[]): Promise<boolean> {
  if (paths.length === 0) return true;
  const r = await run(["git", "check-ignore", "--stdin", "-z"], { cwd: repo, input: paths.join("\0") + "\0", env });
  // 1 means none is ignored; more is an error, so refresh to be safe.
  if (r.code !== 0) return false;
  return r.out.split("\0").filter(Boolean).length === paths.length;
}
