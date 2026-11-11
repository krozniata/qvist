// Fetching, pulling and pushing, and the sync button that does what is due.
import * as git from "../git";
import type { App } from "./app";

// sync does what the button says; level with the remote, it fetches to
// see whether that is still so.
export function sync(a: App): Promise<void> {
  if (a.status?.detached) return Promise.resolve(a.flash("Switch to a branch to sync it", true));
  return remote(a, a.syncWhat() ?? "fetch");
}

// remote fetches, pulls, pushes, or pulls then pushes. It runs beside the
// input queue, so keys still work while the network is slow; quiet keeps a
// background fetch from saying anything.
export async function remote(a: App, what: "fetch" | "pull" | "push" | "sync", quiet = false): Promise<void> {
  if (!a.repo || a.syncing) return;
  const repo = a.repo, publish = a.publishTo();
  if (a.remotes.length === 0) return a.flash("This repository has no remote", true);
  if (what !== "fetch" && !publish && !a.status?.upstream) {
    return a.flash(`${a.status?.branch ?? "This branch"} tracks no remote branch`, true);
  }
  a.syncing = what;
  if (!quiet) a.render();
  try {
    if (what === "fetch") await git.fetch(repo);
    if (what === "pull" || what === "sync") await git.pull(repo);
    if (what === "push" || what === "sync") await git.push(repo, publish ?? undefined);
    a.syncing = null;
    a.serial(() => a.refresh(what !== "fetch"));
    if (!quiet) a.flash(what === "fetch" ? "Fetched" : what === "pull" ? "Pulled" : publish ? `Published ${publish.branch} to ${publish.remote}` : what === "push" ? "Pushed" : "Synced");
  } catch (err) {
    a.syncing = null;
    if (!quiet) a.flash(err instanceof Error ? err.message : String(err), true);
    else a.render();
  }
}
