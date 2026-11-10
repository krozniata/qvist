// Gives the tests a HOME of their own, with no system git config, so git
// reads only what a test sets up and never touches the real ~/.gitconfig.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "bun:test";

const home = mkdtempSync(join(tmpdir(), "qvist-home-"));
process.env.HOME = home;
process.env.XDG_CONFIG_HOME = join(home, ".config");
process.env.GIT_CONFIG_NOSYSTEM = "1";
delete process.env.GIT_CONFIG_GLOBAL;
afterAll(() => rmSync(home, { recursive: true, force: true }));
