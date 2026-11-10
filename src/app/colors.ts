// Follows the terminal's colours: asks for its background, foreground and
// palette, and re-themes the pane when they change.
import { colorOf, pickTheme, type RGB, type Theme, wear } from "../theme";
import type { App } from "./app";

// colorQueries asks for the palette's red, green, yellow and blue (OSC 4),
// the background (11), then the foreground (10), which answers last.
const colorQueries = [..."1234"].map((n) => `\x1b]4;${n};?\x1b\\`).join("") + "\x1b]11;?\x1b\\\x1b]10;?\x1b\\";

// colorReply reads a terminal's answer such as "4;1;rgb:cdcd/0000/0000" as
// what was asked and the colour.
function colorReply(text: string): [string, RGB] | null {
  const m = /^(1[01]|4;[1-4]);(rgb:[0-9a-fA-F/]+)/.exec(text);
  const c = m && colorOf(m[2]);
  return m && c ? [m[1], c] : null;
}

// detectTheme asks the terminal for its background and foreground (OSC 11
// and 10) before input starts, then picks the Rex theme that matches.
export async function detectTheme(a: App): Promise<Theme> {
  await new Promise<void>((done) => {
    const timer = setTimeout(done, 300);
    const onData = (b: Buffer) => {
      for (const m of b.toString("latin1").matchAll(/\x1b\]([^\x07\x1b]*)/g)) {
        const r = colorReply(m[1]);
        if (r) a.colors.set(...r);
      }
      // The foreground is asked last, so its answer means all are in.
      if (a.colors.has("10")) {
        clearTimeout(timer);
        process.stdin.off("data", onData);
        done();
      }
    };
    process.stdin.on("data", onData);
    askColors(a);
  });
  process.stdin.removeAllListeners("data");
  return themeOfColors(a);
}

export async function themeOfColors(a: App): Promise<Theme> {
  const c = a.colors;
  const t = await pickTheme(c.get("11") ?? null, c.get("10") ?? null, { red: c.get("4;1"), green: c.get("4;2"), yellow: c.get("4;3"), blue: c.get("4;4") });
  wear(t);
  return t;
}

// ── input ──

export function askColors(a: App): void {
  a.t.write(colorQueries);
  a.t.flush();
}

// onColor takes the terminal's answer about one of its colours, and once
// the last is in, re-themes the pane if any changed.
export async function onColor(a: App, text: string): Promise<void> {
  const r = colorReply(text);
  if (!r) return;
  const [key, c] = r, was = a.colors.get(key);
  if (!was || was.some((v, i) => v !== c[i])) {
    a.colors.set(key, c);
    a.recolor = true;
  }
  if (key !== "10" || !a.recolor) return;
  a.recolor = false;
  a.theme = await themeOfColors(a);
  a.render();
}
