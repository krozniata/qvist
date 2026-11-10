import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { edit } from "../src/app/input";
import { type InputEvent, type Key, parse, readEvents } from "../src/terminal/input";

const key = (name: string, rune = ""): Key => ({ kind: "key", rune, name });
const one = (s: string) => parse(Buffer.from(s));

describe("parse", () => {
  test("reads keys, control keys and multi-byte characters", () => {
    expect(one("a")).toEqual([key("", "a"), 1]);
    expect(one("ż")).toEqual([key("", "ż"), 2]);
    expect(one("\r")).toEqual([key("enter"), 1]);
    expect(one("\x01")).toEqual([key("ctrl+a"), 1]);
    expect(one("\x7f")).toEqual([key("backspace"), 1]);
    expect(one("\x1b\x7f")).toEqual([key("alt+backspace"), 2]);
  });

  test("reads arrows and editing keys in both encodings", () => {
    expect(one("\x1b[A")).toEqual([key("up"), 3]);
    expect(one("\x1bOB")).toEqual([key("down"), 3]);
    expect(one("\x1b[1;2C")).toEqual([key("right"), 6]);
    expect(one("\x1b[5~")).toEqual([key("pageup"), 4]);
    expect(one("\x1b[Z")).toEqual([key("shift+tab"), 3]);
  });

  test("reads SGR mouse reports at 0-based cells", () => {
    expect(one("\x1b[<0;10;5M")).toEqual([{ kind: "mouse", button: 0, x: 9, y: 4, release: false, motion: false }, 10]);
    expect(one("\x1b[<32;1;1m")).toEqual([{ kind: "mouse", button: 0, x: 0, y: 0, release: true, motion: true }, 10]);
    expect(one("\x1b[<64;3;3M")[0]).toMatchObject({ button: 64 });
  });

  test("reads pastes, colour replies and theme changes", () => {
    const paste = "\x1b[200~hi\nthere\x1b[201~", reply = "\x1b]11;rgb:1e1e/1e1e/2020\x1b\\";
    // Each is read whole, and only it: what follows is the next event.
    expect(one(paste + "q")).toEqual([{ kind: "paste", text: "hi\nthere" }, paste.length]);
    expect(one(reply + "q")).toEqual([{ kind: "osc", text: "11;rgb:1e1e/1e1e/2020" }, reply.length]);
    expect(one("\x1b]10;rgb:ff/ff/ff\x07")[0]).toEqual({ kind: "osc", text: "10;rgb:ff/ff/ff" });
    expect(one("\x1b[?997;1n")).toEqual([{ kind: "theme", dark: true }, 9]);
  });

  test("waits for the rest of an unfinished sequence", () => {
    for (const s of ["\x1b", "\x1b[", "\x1b[<0;10", "\x1b[200~half", "\x1b]11;rgb:"]) expect(one(s)[1]).toBe(0);
    // The first byte of ż, without its second.
    expect(parse(Buffer.from([0xc5]))[1]).toBe(0);
  });
});

describe("readEvents", () => {
  const events = () => {
    const input = new EventEmitter(), out: InputEvent[] = [];
    readEvents(input as never, (ev) => out.push(ev));
    return { send: (s: string) => input.emit("data", Buffer.from(s)), out };
  };

  test("joins a sequence split across reads", () => {
    const { send, out } = events();
    send("\x1b[<0;1");
    send("2;3Mq");
    expect(out).toEqual([{ kind: "mouse", button: 0, x: 11, y: 2, release: false, motion: false }, key("", "q")]);
  });

  test("turns a lone escape into esc once nothing follows", async () => {
    const { send, out } = events();
    send("\x1b");
    expect(out).toEqual([]);
    await Bun.sleep(60);
    expect(out).toEqual([key("esc")]);
  });
});

describe("edit", () => {
  test("deletes a character, a word, or the whole field", () => {
    expect(edit("feat/upgrade", key("backspace"))).toBe("feat/upgrad");
    expect(edit("feat/upgrade", key("alt+backspace"))).toBe("feat/");
    expect(edit("fix the bug  ", key("ctrl+w"))).toBe("fix the ");
    expect(edit("anything", key("ctrl+u"))).toBe("");
    expect(edit("anything", key("", "x"))).toBeNull();
  });
});
