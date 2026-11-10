import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { install, uninstall } from "../src/install/install";

const dir = join(process.env.XDG_CONFIG_HOME!, "rex");
const init = join(dir, "init.lua"), action = join(dir, "qvist.lua");

// Keep rex off PATH, so the tests never reload the real Rex's config.
const path = process.env.PATH;
beforeAll(() => {
  process.env.PATH = "/usr/bin:/bin";
  spyOn(console, "log").mockImplementation(() => {});
});
afterAll(() => {
  process.env.PATH = path;
});

describe("install", () => {
  test("adds the action to Rex's config once, beside what is there", async () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(init, "require(\"mine\")");
    await install("/opt/qvist/bin/qvist");
    await install("/opt/qvist/bin/qvist");

    expect(readFileSync(init, "utf8")).toBe('require("mine")\nrequire("qvist")\n');
    const lua = readFileSync(action, "utf8");
    expect(lua).toContain('local BIN = "/opt/qvist/bin/qvist"');
    expect(lua).toContain('name = "qvist_toggle"');
  });

  test("quotes a path Lua would otherwise misread", async () => {
    await install('/Users/a "b"/qvist');
    expect(readFileSync(action, "utf8")).toContain('local BIN = "/Users/a \\"b\\"/qvist"');
    await install("/Users/a\\b\nc/qvist");
    expect(readFileSync(action, "utf8")).toContain('local BIN = "/Users/a\\\\b\\nc/qvist"');
  });

  test("refuses to point Rex at bun itself", async () => {
    await expect(install("/usr/local/bin/bun")).rejects.toThrow("compile qvist first");
  });

  test("uninstall takes out only what install added", async () => {
    await uninstall();
    expect(existsSync(action)).toBe(false);
    expect(readFileSync(init, "utf8")).toBe('require("mine")\n');
    // Uninstalling again finds nothing to do.
    await uninstall();
    expect(readFileSync(init, "utf8")).toBe('require("mine")\n');
  });
});
