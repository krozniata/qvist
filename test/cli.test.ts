import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { run } from "../src/exec";

const main = join(import.meta.dir, "../src/main.ts");
const qvist = (...args: string[]) => run([process.execPath, main, ...args]);

describe("qvist", () => {
  test("prints its version with -v and --version", async () => {
    for (const flag of ["-v", "--version"]) {
      const r = await qvist(flag);
      expect([r.code, r.out]).toEqual([0, "qvist dev\n"]);
    }
  });

  test("prints its usage with --help", async () => {
    const r = await qvist("--help");
    expect(r.code).toBe(0);
    expect(r.out).toStartWith("usage: qvist [DIR]");
    expect(r.out).toContain("-v, --version");
  });

  test("says it needs a terminal, rather than crashing, when it hasn't one", async () => {
    const r = await qvist();
    expect([r.code, r.err]).toEqual([1, "qvist: run qvist in a terminal\n"]);
  });
});
