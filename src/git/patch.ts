// The patches the diff view shows.
import { git, gitMaybe } from "./run";
import type { Change } from "./status";

// diffArgs asks for context lines of unmodified code around each change;
// the whole file is a context too large to cut.
const diffArgs = (context: number) => ["--no-color", "--no-ext-diff", `-U${context}`, "--find-renames"];

// patchFor answers the unified diff of one change: what staging it would add
// to the index, or for a staged one what committing it would.
export async function patchFor(repo: string, c: Change, context = 3): Promise<string> {
  if (c.code === "U") return gitMaybe(repo, ["diff", ...diffArgs(context), "--no-index", "--", "/dev/null", c.path]);
  const paths = c.from ? [c.from, c.path] : [c.path];
  return git(repo, ["diff", ...diffArgs(context), ...(c.staged ? ["--cached"] : []), "--", ...paths]);
}

export async function commitPatch(repo: string, sha: string, path: string, context = 3): Promise<string> {
  return git(repo, ["show", "--format=", ...diffArgs(context), sha, "--", path]);
}
