import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import * as git from "../src/git";
import { commitAll, repo, sh, write } from "./repo";

const paths = (cs: { path: string; code: string }[]) => cs.map((c) => `${c.code} ${c.path}`);

describe("status", () => {
  test("splits staged changes from the rest, by VS Code's letters", async () => {
    const dir = await repo();
    write(dir, "kept.txt", "one\n");
    write(dir, "gone.txt", "two\n");
    await commitAll(dir, "first");
    write(dir, "kept.txt", "one, changed\n");
    rmSync(join(dir, "gone.txt"));
    write(dir, "new/deep.txt", "three\n");
    write(dir, "staged.txt", "four\n");
    await git.stage(dir, ["staged.txt"]);

    const s = await git.status(dir);
    expect(s.branch).toBe("main");
    expect(paths(s.staged)).toEqual(["A staged.txt"]);
    expect(paths(s.changes)).toEqual(["D gone.txt", "M kept.txt", "U new/deep.txt"]);
  });

  test("reports a staged rename with where it came from", async () => {
    const dir = await repo();
    write(dir, "old.txt", "the same text\n");
    await commitAll(dir, "first");
    renameSync(join(dir, "old.txt"), join(dir, "new.txt"));
    await git.stageAll(dir);

    expect((await git.status(dir)).staged).toEqual([{ path: "new.txt", code: "R", staged: true, from: "old.txt" }]);
  });

  test("names the branch before its first commit", async () => {
    const dir = await repo();
    const s = await git.status(dir);
    expect([s.branch, s.detached, s.staged.length, s.changes.length]).toEqual(["main", false, 0, 0]);
  });

  test("says when HEAD is detached", async () => {
    const dir = await repo();
    write(dir, "a.txt", "a\n");
    await commitAll(dir, "first");
    await sh(dir, "switch", "-q", "--detach");
    expect((await git.status(dir)).detached).toBe(true);
  });

  test("marks a conflict with !", async () => {
    const dir = await repo();
    write(dir, "a.txt", "base\n");
    await commitAll(dir, "base");
    await sh(dir, "switch", "-q", "-c", "other");
    write(dir, "a.txt", "theirs\n");
    await commitAll(dir, "theirs");
    await sh(dir, "switch", "-q", "main");
    write(dir, "a.txt", "ours\n");
    await commitAll(dir, "ours");
    await sh(dir, "merge", "-q", "other").catch(() => {});

    expect(paths((await git.status(dir)).changes)).toEqual(["! a.txt"]);
  });
});

describe("staging and committing", () => {
  test("unstages before the first commit, when there is no HEAD", async () => {
    const dir = await repo();
    write(dir, "a.txt", "a\n");
    write(dir, "b.txt", "b\n");
    await git.stageAll(dir);
    await git.unstage(dir, ["a.txt"]);
    expect(paths((await git.status(dir)).staged)).toEqual(["A b.txt"]);
    await git.unstageAll(dir);
    expect((await git.status(dir)).staged).toEqual([]);
  });

  test("unstages back to HEAD once there is one", async () => {
    const dir = await repo();
    write(dir, "a.txt", "a\n");
    await commitAll(dir, "first");
    write(dir, "a.txt", "a, changed\n");
    await git.stageAll(dir);
    await git.unstageAll(dir);
    const s = await git.status(dir);
    expect([paths(s.staged), paths(s.changes)]).toEqual([[], ["M a.txt"]]);
  });

  test("commits the message as given, and amends it", async () => {
    const dir = await repo();
    write(dir, "a.txt", "a\n");
    await git.stageAll(dir);
    await git.commit(dir, "Add a\n\nWith a body.", false);
    expect(await git.lastMessage(dir)).toBe("Add a\n\nWith a body.");
    await git.commit(dir, "Add the letter a", true);
    expect(await git.lastMessage(dir)).toBe("Add the letter a");
    expect((await git.log(dir)).length).toBe(1);
  });

  test("discards a change to a tracked file, and an untracked file", async () => {
    const dir = await repo();
    write(dir, "a.txt", "a\n");
    await commitAll(dir, "first");
    write(dir, "a.txt", "scribbled\n");
    write(dir, "junk.txt", "junk\n");
    for (const c of (await git.status(dir)).changes) await git.discard(dir, c);

    expect(readFileSync(join(dir, "a.txt"), "utf8")).toBe("a\n");
    expect(existsSync(join(dir, "junk.txt"))).toBe(false);
    expect((await git.status(dir)).changes).toEqual([]);
  });

  test("tells ignored paths from tracked ones", async () => {
    const dir = await repo();
    write(dir, ".gitignore", "*.log\n");
    write(dir, "a.txt", "a\n");
    await commitAll(dir, "first");
    expect(await git.allIgnored(dir, ["debug.log", "x/trace.log"])).toBe(true);
    expect(await git.allIgnored(dir, ["debug.log", "a.txt"])).toBe(false);
    expect(await git.allIgnored(dir, [])).toBe(true);
  });
});

describe("patches", () => {
  test("diffs an untracked file against nothing, and a staged one against HEAD", async () => {
    const dir = await repo();
    write(dir, "a.txt", "one\n");
    await commitAll(dir, "first");
    write(dir, "a.txt", "two\n");
    write(dir, "new.txt", "fresh\n");
    await git.stage(dir, ["a.txt"]);
    const s = await git.status(dir);

    expect(await git.patchFor(dir, s.changes[0])).toContain("+fresh");
    const staged = await git.patchFor(dir, s.staged[0]);
    expect(staged).toContain("-one");
    expect(staged).toContain("+two");
  });
});

describe("history", () => {
  test("lists commits newest first, with their parents, refs and files", async () => {
    const dir = await repo();
    write(dir, "a.txt", "a\n");
    await commitAll(dir, "first");
    write(dir, "b.txt", "b\n");
    renameSync(join(dir, "a.txt"), join(dir, "c.txt"));
    await sh(dir, "add", "-A");
    await sh(dir, "commit", "-q", "-m", "second", "-m", "The body.");

    const [second, first] = await git.log(dir);
    expect([second.subject, second.body, second.author, second.email]).toEqual(["second", "The body.", "Ada", "ada@example.com"]);
    expect(second.parents).toEqual([first.sha]);
    expect(second.refs).toContain("main");
    expect(first.parents).toEqual([]);
    expect(await git.commitFiles(dir, second.sha)).toEqual([{ path: "b.txt", code: "A" }, { path: "c.txt", code: "R" }]);
  });

  test("answers no commits for an empty repository", async () => {
    expect(await git.log(await repo())).toEqual([]);
  });
});

describe("branches", () => {
  test("creates, renames and deletes branches", async () => {
    const dir = await repo();
    write(dir, "a.txt", "a\n");
    await commitAll(dir, "first");
    await git.createBranch(dir, "feature");
    await git.renameBranch(dir, "feature", "feat");
    expect((await git.branches(dir)).map((b) => [b.name, b.current])).toEqual([["feat", true], ["main", false]]);

    await git.checkout(dir, "main");
    write(dir, "a.txt", "unmerged\n");
    await git.checkout(dir, "feat");
    await commitAll(dir, "unmerged work");
    await git.checkout(dir, "main");
    // git keeps a branch with unmerged work unless forced.
    await expect(git.deleteBranch(dir, "feat", false)).rejects.toThrow(git.GitError);
    await git.deleteBranch(dir, "feat", true);
    expect((await git.branches(dir)).map((b) => b.name)).toEqual(["main"]);
  });
});

describe("remotes", () => {
  test("counts commits ahead and behind, and pulls and pushes", async () => {
    const origin = await repo();
    write(origin, "a.txt", "a\n");
    await commitAll(origin, "first");
    const dir = await repo();
    await sh(dir, "remote", "add", "origin", origin);
    await git.fetch(dir);
    await sh(dir, "reset", "-q", "--hard", "origin/main");
    await sh(dir, "branch", "-q", "-u", "origin/main");

    write(origin, "b.txt", "b\n");
    await commitAll(origin, "theirs");
    await git.fetch(dir);
    expect(await git.remotes(dir)).toEqual(["origin"]);
    let s = await git.status(dir);
    expect([s.upstream, s.ahead, s.behind]).toEqual(["origin/main", 0, 1]);

    await git.pull(dir);
    write(dir, "c.txt", "c\n");
    await commitAll(dir, "ours");
    s = await git.status(dir);
    expect([s.ahead, s.behind]).toEqual([1, 0]);

    // A checked-out branch can't be pushed to, so origin moves off it.
    await sh(origin, "switch", "-q", "--detach");
    await git.push(dir);
    s = await git.status(dir);
    expect([s.ahead, s.behind]).toEqual([0, 0]);
  });

  test("says to pull first when the remote has commits we don't", async () => {
    const origin = await repo();
    write(origin, "a.txt", "a\n");
    await commitAll(origin, "first");
    const dir = await repo();
    await sh(dir, "remote", "add", "origin", origin);
    await git.fetch(dir);
    await sh(dir, "reset", "-q", "--hard", "origin/main");
    await sh(dir, "branch", "-q", "-u", "origin/main");
    write(origin, "b.txt", "b\n");
    await commitAll(origin, "theirs");
    await sh(origin, "switch", "-q", "--detach");
    write(dir, "c.txt", "c\n");
    await commitAll(dir, "ours");

    await expect(git.push(dir)).rejects.toThrow("The remote has commits you don't — pull first");
  });
});

describe("config", () => {
  test("lists a scope's entries, noting which a later scope overrides", async () => {
    const dir = await repo();
    await git.setConfig(dir, "global", "user.name", "Global Ada");
    await git.setConfig(dir, "global", "core.editor", "vim");

    const global = await git.config(dir, "global");
    const name = global.find((e) => e.key === "user.name")!;
    expect([name.value, name.overriddenBy]).toEqual(["Global Ada", "local"]);
    expect(global.find((e) => e.key === "core.editor")?.overriddenBy).toBe("");
    // user comes before core, as the settings people change most go first.
    expect(global.map((e) => e.section)).toEqual(["user", "core"]);

    await git.unsetConfig(dir, "global", "core.editor");
    expect((await git.config(dir, "global")).map((e) => e.key)).toEqual(["user.name"]);
  });

  test("answers who commits, and from which scope", async () => {
    const dir = await repo();
    expect(await git.identity(dir)).toEqual({ name: "Ada", email: "ada@example.com", scope: "local", guessed: false });
  });

  test("finds each scope's file, and says why one can't be read", async () => {
    const dir = await repo();
    expect(await git.configPath(dir, "local")).toBe(join(dir, ".git", "config"));
    expect(await git.configPath(null, "global")).toBe(join(process.env.HOME!, ".gitconfig"));
    await expect(git.configPath(null, "local")).rejects.toThrow("Open a repository");

    expect(await git.checkConfig(join(dir, ".git", "config"))).toBe("");
    write(dir, "broken", "[user\nname = x\n");
    expect(await git.checkConfig(join(dir, "broken"))).not.toBe("");
  });
});
