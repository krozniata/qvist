// The Changes tab's commands: staging, discarding and committing.
import * as git from "../git";
import type { App } from "./app";

// ── actions ──

export async function toggleStage(a: App, c: git.Change): Promise<void> {
  if (c.staged) await git.unstage(a.repo!, [c.path]);
  else await git.stage(a.repo!, [c.path]);
  await a.refresh();
}

export async function stageAll(a: App): Promise<void> {
  await git.stageAll(a.repo!);
  await a.refresh();
}

export async function unstageAll(a: App): Promise<void> {
  await git.unstageAll(a.repo!);
  await a.refresh();
}

export function askDiscard(a: App, c: git.Change): void {
  a.confirm = {
    question: c.code === "U" ? `Delete ${c.path}? It isn't tracked, so a can't be undone.` : `Discard your changes to ${c.path}? This can't be undone.`,
    yes: async () => {
      await git.discard(a.repo!, c);
      await a.refresh();
      a.flash(`Discarded ${c.path}`);
    },
  };
}

export async function toggleAmend(a: App): Promise<void> {
  a.amend = !a.amend;
  if (a.amend && a.message.trim() === "") a.message = await git.lastMessage(a.repo!).catch(() => "");
}

export async function commit(a: App): Promise<void> {
  if (!a.repo) return;
  if (a.message.trim() === "") return a.flash("Write a message first", true);
  if (!a.amend && (a.status?.staged.length ?? 0) === 0) return a.flash("Nothing is staged — press a to stage everything", true);
  const line = await git.commit(a.repo, a.message.trim() + "\n", a.amend);
  a.message = "";
  a.amend = false;
  a.focus = "list";
  await a.refresh();
  a.flash(line);
}
