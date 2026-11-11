// Listing, switching and managing branches.
import { git, US } from "./run";

export type Branch = { name: string; current: boolean; remote: boolean; upstream: string; track: string };

export async function branches(repo: string): Promise<Branch[]> {
  const out = await git(repo, ["for-each-ref", "--sort=-committerdate", `--format=%(refname:short)${US}%(HEAD)${US}%(upstream:short)${US}%(refname)${US}%(upstream:track)`, "refs/heads", "refs/remotes"]);
  return out.split("\n").filter(Boolean).map((l) => {
    const [name, head, upstream, ref, track] = l.split(US);
    return { name, current: head === "*", remote: ref.startsWith("refs/remotes/"), upstream, track };
  }).filter((b) => !b.name.endsWith("/HEAD") && b.name !== "origin");
}

export const checkout = (repo: string, name: string) => git(repo, ["switch", name]);
export const checkoutRemote = (repo: string, name: string) => git(repo, ["switch", "--track", name]);
export const createBranch = (repo: string, name: string) => git(repo, ["switch", "-c", name]);
// deleteBranch deletes a local branch; without force git refuses one whose
// commits aren't merged anywhere.
export const deleteBranch = (repo: string, name: string, force: boolean) => git(repo, ["branch", force ? "-D" : "-d", name]);
export const renameBranch = (repo: string, from: string, to: string) => git(repo, ["branch", "-m", from, to]);
export const setUpstream = (repo: string, name: string, upstream: string) =>
  git(repo, upstream ? ["branch", `--set-upstream-to=${upstream}`, name] : ["branch", "--unset-upstream", name]);

// createBranchFrom starts a branch at base without tracking it, so a branch
// cut from origin/main doesn't push back to main.
export const createBranchFrom = (repo: string, name: string, base: string) => git(repo, ["switch", "--no-track", "-c", name, base]);
