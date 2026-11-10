// Throwaway repositories for the tests that run git.
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { run } from "../src/exec";

export async function sh(cwd: string, ...args: string[]): Promise<string> {
  const r = await run(["git", ...args], { cwd });
  if (r.code !== 0) throw new Error(`git ${args.join(" ")}: ${r.err}`);
  return r.out;
}

// repo makes an empty repository on main, committing as Ada.
export async function repo(): Promise<string> {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "qvist-repo-")));
  await sh(dir, "init", "-q", "-b", "main");
  await sh(dir, "config", "user.name", "Ada");
  await sh(dir, "config", "user.email", "ada@example.com");
  return dir;
}

export function write(dir: string, path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

// commitAll stages everything and commits it with message.
export async function commitAll(dir: string, message: string): Promise<void> {
  await sh(dir, "add", "-A");
  await sh(dir, "commit", "-q", "-m", message);
}
