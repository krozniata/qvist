// The branch picker: switching, creating, deleting, renaming and setting
// what a branch tracks.
import * as git from "../git";
import type { App } from "./app";

// ── the branch picker ──

export async function openPicker(a: App): Promise<void> {
  const branches = await git.branches(a.repo!);
  a.picker = { mode: "switch", query: "", sel: 0, top: 0, branches };
  a.render();
}

export async function pick(a: App, i: number): Promise<void> {
  const p = a.picker!, item = a.pickerItems()[i];
  if (!item) return;
  if (item.kind === "createFrom") {
    // Choose the base next; the name typed so far waits for it.
    a.picker = { mode: "base", query: "", sel: 0, top: 0, branches: p.branches };
    a.pendingName = item.name;
    return a.render();
  }
  a.picker = null;
  if (item.kind === "create") return askBranchName(a, item.name, null);
  if (p.mode === "base") return askBranchName(a, a.pendingName, item.branch.name);
  const b = item.branch;
  if (b.current) return a.render();
  if (b.remote) await git.checkoutRemote(a.repo!, b.name);
  else await git.checkout(a.repo!, b.name);
  await a.refresh();
  a.flash(`Switched to ${b.name}`);
}

// pickedBranch is the local branch under the picker's selection, which the
// managing keys act on.
export function pickedBranch(a: App): git.Branch | null {
  const item = a.picker ? a.pickerItems()[a.picker.sel] : undefined;
  return item?.kind === "branch" && !item.branch.remote ? item.branch : null;
}

// reopenPicker reads the branches again after a change, keeping the query.
export async function reopenPicker(a: App, query: string): Promise<void> {
  const branches = await git.branches(a.repo!);
  a.picker = { mode: "switch", query, sel: 0, top: 0, branches };
  a.render();
}

export function askDeleteBranch(a: App): void {
  const b = pickedBranch(a), query = a.picker!.query;
  if (!b) return a.flash("Choose a local branch to delete", true);
  if (b.current) return a.flash("You're on a branch: switch to another first", true);
  a.confirm = {
    question: `Delete ${b.name}?`,
    yes: async () => {
      try {
        await git.deleteBranch(a.repo!, b.name, false);
      } catch {
        // git refuses a branch with commits nowhere else: ask again before losing them.
        a.confirm = {
          question: `${b.name} isn't merged — its commits will be lost. Delete anyway?`,
          yes: async () => {
            await git.deleteBranch(a.repo!, b.name, true);
            await reopenPicker(a, query);
            a.flash(`Deleted ${b.name}`);
          },
        };
        return;
      }
      await reopenPicker(a, query);
      a.flash(`Deleted ${b.name}`);
    },
  };
}

export function askRenameBranch(a: App): void {
  const b = pickedBranch(a);
  if (!b) return a.flash("Choose a local branch to rename", true);
  a.picker = null;
  a.prompt = {
    label: `Rename ${b.name} to`,
    value: b.name,
    submit: async (name) => {
      await git.renameBranch(a.repo!, b.name, name);
      await a.refresh();
      await reopenPicker(a, "");
      a.flash(`Renamed ${b.name} to ${name}`);
    },
  };
}

// askUpstream sets the branch a local one tracks, offering the remote
// branch of the same name; an empty answer stops it tracking any.
export function askUpstream(a: App): void {
  const b = pickedBranch(a);
  if (!b) return a.flash("Choose a local branch to set its upstream", true);
  a.picker = null;
  a.prompt = {
    label: `Upstream of ${b.name}`,
    placeholder: "empty to stop tracking",
    value: b.upstream || `origin/${b.name}`,
    allowEmpty: true,
    submit: async (upstream) => {
      await git.setUpstream(a.repo!, b.name, upstream);
      await a.refresh();
      await reopenPicker(a, "");
      a.flash(upstream ? `${b.name} now tracks ${upstream}` : `${b.name} tracks nothing now`);
    },
  };
}

// askBranchName asks for the new branch's name, filled with what was typed,
// then creates it from base, or from where you are.
export function askBranchName(a: App, name: string, base: string | null): void {
  a.prompt = {
    label: base ? `New branch from ${base}` : "New branch",
    value: name,
    placeholder: "feature/name",
    submit: async (v) => {
      if (base) await git.createBranchFrom(a.repo!, v, base);
      else await git.createBranch(a.repo!, v);
      await a.refresh();
      a.flash(`Switched to a new branch ${v}${base ? ` from ${base}` : ""}`);
    },
  };
  a.render();
}
