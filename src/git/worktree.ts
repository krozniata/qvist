// Changing the index and work tree, and committing.
import { git } from "./run";
import type { Change } from "./status";

export const stage = (repo: string, paths: string[]) => git(repo, ["add", "--", ...paths]);
export const stageAll = (repo: string) => git(repo, ["add", "--all"]);

// reset unstages against HEAD, or before the first commit against nothing.
export const unstage = (repo: string, paths: string[]) => git(repo, ["reset", "-q", "--", ...paths]);
export const unstageAll = (repo: string) => git(repo, ["reset", "-q"]);

export async function discard(repo: string, c: Change): Promise<void> {
  if (c.code === "U") await git(repo, ["clean", "-f", "-q", "--", c.path]);
  else await git(repo, ["restore", "--worktree", "--", c.path]);
}

export async function commit(repo: string, message: string, amend: boolean): Promise<string> {
  const out = await git(repo, ["commit", ...(amend ? ["--amend"] : []), "-F", "-"], message);
  return out.split("\n")[0];
}

export async function lastMessage(repo: string): Promise<string> {
  return (await git(repo, ["log", "-1", "--format=%B"])).trimEnd();
}
