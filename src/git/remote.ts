// Talking to remotes.
import { run } from "../exec";
import { env, git, GitError } from "./run";

// remoteEnv keeps ssh from asking for a passphrase on the pane's terminal:
// without a key in the agent it fails instead, and git says why.
const remoteEnv = () => ({ ...env, GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? "ssh -o BatchMode=yes" });

async function gitRemote(cwd: string, args: string[]): Promise<void> {
  const r = await run(["git", "-c", "color.ui=never", ...args], { cwd, env: remoteEnv() });
  if (r.code !== 0) throw new GitError(remoteError((r.err || r.out).trim()) || `git ${args[0]} failed`);
}

// remoteError turns git's usual refusals into one line that says what to do.
function remoteError(err: string): string {
  if (/non-fast-forward|fetch first|\[rejected\]/.test(err)) return "The remote has commits you don't — pull first";
  if (/Not possible to fast-forward|diverg/i.test(err)) return "Your branch and the remote have diverged — merge or rebase in a terminal";
  if (/Permission denied \(publickey\)|Host key verification failed/.test(err)) return "ssh refused: add your key with ssh-add";
  if (/Could not resolve host|unable to access/.test(err)) return "Can't reach the remote";
  return err.split("\n").filter((l) => l.startsWith("fatal:") || l.startsWith("error:")).join(" ") || err.split("\n")[0];
}

export async function remotes(repo: string): Promise<string[]> {
  return (await git(repo, ["remote"])).split("\n").filter(Boolean);
}

export const fetch = (repo: string) => gitRemote(repo, ["fetch", "--quiet", "--prune"]);
// pull only fast-forwards, so it never makes a merge commit.
export const pull = (repo: string) => gitRemote(repo, ["pull", "--quiet", "--ff-only"]);
// push sets the branch to track remote's branch of its name when it tracks nothing yet.
export const push = (repo: string, publish?: { remote: string; branch: string }) =>
  gitRemote(repo, publish ? ["push", "--quiet", "-u", publish.remote, publish.branch] : ["push", "--quiet"]);
