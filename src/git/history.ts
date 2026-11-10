// The commit log and what each commit changed.
import { git, RS, US } from "./run";

export type Commit = { sha: string; short: string; subject: string; body: string; author: string; email: string; at: number; refs: string; parents: string[] };

export async function log(repo: string, limit = 500): Promise<Commit[]> {
  let out: string;
  try {
    // Every branch, in topological order, so the graph's lanes join up.
    out = await git(repo, ["log", "--all", "--topo-order", "-n", String(limit), `--format=%H${US}%h${US}%s${US}%an${US}%at${US}%D${US}%P${US}%ae${US}%b${RS}`]);
  } catch {
    return []; // no commits yet
  }
  return out.split(RS).map((s) => s.trim()).filter(Boolean).map((s) => {
    const [sha, short, subject, author, at, refs, parents, email, body] = s.split(US);
    return { sha, short, subject, body: (body ?? "").trim(), author, email, at: Number(at) * 1000, refs, parents: parents ? parents.split(" ") : [] };
  });
}

export type CommitFile = { path: string; code: string };

export async function commitFiles(repo: string, sha: string): Promise<CommitFile[]> {
  const out = await git(repo, ["show", "--format=", "--name-status", "-z", "--find-renames", sha]);
  const parts = out.split("\0").filter(Boolean);
  const files: CommitFile[] = [];
  for (let i = 0; i < parts.length; i++) {
    const code = parts[i][0];
    if (code === "R" || code === "C") {
      files.push({ path: parts[i + 2], code: "R" });
      i += 2;
    } else {
      files.push({ path: parts[++i], code });
    }
  }
  return files;
}
