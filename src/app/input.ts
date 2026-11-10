// What input does: each key by what has focus (a popup, the picker, a field,
// or the list or diff of the tab on screen), pastes, and the terminal's replies.
import * as git from "../git";
import type { InputEvent, Key } from "../terminal/input";
import { type App, tabs } from "./app";
import { askColors, onColor } from "./colors";
import { mouse } from "./mouse";
import { askDeleteBranch, askRenameBranch, askUpstream, openPicker, pick } from "./branches";
import { editConfigFile, moveConfig, setScope } from "./settings";
import { remote, sync } from "./remote";
import { askDiscard, commit, stageAll, toggleAmend, toggleStage, unstageAll } from "./changes";
import { loadDiff, toggleFull } from "./diffs";

// edit applies the keys every text field shares to value: ⌫ deletes a
// character, ⌥⌫ or ⌃W the word before the cursor, ⌘⌫ (which terminals send
// as ⌃U) the whole field. It answers null for any other key.
export function edit(value: string, k: Key): string | null {
  if (k.name === "backspace") return [...value].slice(0, -1).join("");
  // A word ends at a space or punctuation, so feat/upgrade loses upgrade first.
  if (k.name === "alt+backspace" || k.name === "ctrl+w") return value.replace(/\w*\W*$/, "");
  if (k.name === "ctrl+u") return "";
  return null;
}

export async function handle(a: App, ev: InputEvent): Promise<void> {
  if (ev.kind === "osc") return onColor(a, ev.text);
  // Rex may tell of the change before its new colours are in place, so ask
  // at once and again over the next half second.
  if (ev.kind === "theme") {
    for (const ms of [0, 60, 150, 300, 600]) setTimeout(() => askColors(a), ms);
    return;
  }
  if (ev.kind === "key") await key(a, ev);
  else if (ev.kind === "mouse") await mouse(a, ev);
  else if (ev.kind === "paste" && a.picker) {
    [a.picker.query, a.picker.sel] = [a.picker.query + ev.text.replace(/\s+/g, " ").trim(), 0];
    a.render();
  } else if (ev.kind === "paste" && a.prompt) {
    a.prompt.value += ev.text.replace(/\n/g, " ");
    a.render();
  } else if (ev.kind === "paste" && a.focus === "message") {
    a.message += ev.text;
    a.render();
  }
}

export async function key(a: App, k: Key): Promise<void> {
  a.follow = true;
  if (k.name === "ctrl+c") return a.quit();
  if (a.confirm) {
    const c = a.confirm;
    a.confirm = null;
    if (k.rune === "y" || k.rune === "Y" || k.name === "enter") await c.yes();
    a.render();
    return;
  }
  if (a.picker) return pickerKey(a, k);
  if (a.prompt) return promptKey(a, k);
  if (a.focus === "message") return messageKey(a, k);

  const r = k.rune;
  if (r === "q") return a.quit();
  if (r === "b" && a.repo) return openPicker(a);
  if (r >= "1" && r <= "3") return a.setTab(tabs[Number(r) - 1]);
  if (a.tab === "config") return configKey(a, k);
  if (k.name === "tab" || k.name === "shift+tab") {
    a.focus = a.focus === "list" ? "diff" : "list";
    return a.render();
  }
  if (r === "c" && a.tab === "changes") {
    a.focus = "message";
    return a.render();
  }
  if (r === "v") {
    a.split = !a.split;
    a.diffTop = 0;
    return a.render();
  }
  if (r === "e") return toggleFull(a);
  if (r === "r") return a.refresh();
  if (r === "p") return void remote(a, "pull");
  if (r === "P") return void remote(a, "push");
  if (r === "f" && a.focus === "list") return void remote(a, "fetch");
  if (r === "s" && a.focus === "list" && a.tab === "changes") return void sync(a);
  if (a.tab === "history" && a.focus === "list") return historyKey(a, k);
  if (a.focus === "list") return listKey(a, k);
  return diffKeyPress(a, k);
}

export async function historyKey(a: App, k: Key): Promise<void> {
  const r = k.rune, n = a.commits.length;
  if (k.name === "down" || r === "j") a.hsel = Math.min(n - 1, a.hsel + 1);
  else if (k.name === "up" || r === "k") a.hsel = Math.max(0, a.hsel - 1);
  else if (k.name === "pagedown") a.hsel = Math.min(n - 1, a.hsel + a.size.rows - 4);
  else if (k.name === "pageup") a.hsel = Math.max(0, a.hsel - a.size.rows + 4);
  else if (k.name === "home" || r === "g") a.hsel = 0;
  else if (k.name === "end" || r === "G") a.hsel = Math.max(0, n - 1);
  else if (r === "J" || r === "]") a.fsel = Math.min(a.files.length - 1, a.fsel + 1);
  else if (r === "K" || r === "[") a.fsel = Math.max(0, a.fsel - 1);
  else if (k.name === "right" || r === "l" || k.name === "enter") a.focus = "diff";
  else return;
  await loadDiff(a);
  a.render();
}

export async function configKey(a: App, k: Key): Promise<void> {
  const r = k.rune, e = a.configEntry(), editable = a.scope !== "system";
  if (k.name === "down" || r === "j") moveConfig(a, 1);
  else if (k.name === "up" || r === "k") moveConfig(a, -1);
  else if (r === "[" || k.name === "left" || r === "h") await setScope(a, -1);
  else if (r === "]" || k.name === "right" || r === "l") await setScope(a, 1);
  else if ((k.name === "enter" || r === " ") && e && editable)
    a.prompt = {
      label: e.key,
      value: e.value,
      submit: async (v) => {
        await git.setConfig(a.repo, a.scope, e.key, v);
        a.identity = null;
        await a.loadConfig();
        a.flash(`Set ${e.key}`);
      },
    };
  else if (r === "n" && editable)
    a.prompt = {
      label: "New key (section.name = value)",
      value: e ? `${e.section}.` : "",
      submit: async (v) => {
        const m = /^\s*([\w.-]+\.[\w-]+)\s*=?\s*(.*)$/.exec(v);
        if (!m) return a.flash("Write it as section.name = value", true);
        await git.setConfig(a.repo, a.scope, m[1], m[2]);
        a.identity = null;
        await a.loadConfig();
        a.flash(`Set ${m[1]}`);
      },
    };
  else if (r === "d" && e && editable)
    a.confirm = {
      question: `Remove ${e.key} from ${a.scope} config?`,
      yes: async () => {
        await git.unsetConfig(a.repo, a.scope, e.key);
        a.identity = null;
        await a.loadConfig();
        a.flash(`Removed ${e.key}`);
      },
    };
  else if (r === "e") await editConfigFile(a);
  else return;
  a.render();
}

export async function pickerKey(a: App, k: Key): Promise<void> {
  const p = a.picker!, n = a.pickerItems().length;
  if (k.name === "esc") a.picker = null;
  else if (k.name === "down" || k.name === "ctrl+n") p.sel = Math.min(n - 1, p.sel + 1);
  else if (k.name === "up" || k.name === "ctrl+p") p.sel = Math.max(0, p.sel - 1);
  else if (k.name === "enter") return pick(a, p.sel);
  else if (edit(p.query, k) !== null) [p.query, p.sel] = [edit(p.query, k)!, 0];
  else if (k.name === "ctrl+d") askDeleteBranch(a);
  else if (k.name === "ctrl+r") askRenameBranch(a);
  else if (k.name === "ctrl+t") askUpstream(a);
  else if (k.rune && k.rune !== " ") [p.query, p.sel] = [p.query + k.rune, 0];
  a.render();
}

export async function promptKey(a: App, k: Key): Promise<void> {
  const p = a.prompt!;
  if (k.name === "esc") a.prompt = null;
  else if (k.name === "enter") {
    a.prompt = null;
    if (p.value.trim() !== "" || p.allowEmpty) await p.submit(p.value.trim());
  } else if (edit(p.value, k) !== null) p.value = edit(p.value, k)!;
  else if (k.rune) p.value += k.rune;
  a.render();
}

export async function listKey(a: App, k: Key): Promise<void> {
  const r = k.rune, c = a.current();
  if (k.name === "down" || r === "j") a.moveSel(1);
  else if (k.name === "up" || r === "k") a.moveSel(-1);
  else if (k.name === "home" || r === "g") a.selectFile(0);
  else if (k.name === "end" || r === "G") a.selectFile(Infinity);
  else if (k.name === "right" || r === "l" || k.name === "enter") a.focus = "diff";
  else if ((r === " " || r === "-") && c) await toggleStage(a, c);
  else if (r === "a") await stageAll(a);
  else if (r === "u") await unstageAll(a);
  else if (r === "d" && c && !c.staged) askDiscard(a, c);
  else return;
  await loadDiff(a);
  a.render();
}

export async function diffKeyPress(a: App, k: Key): Promise<void> {
  const r = k.rune, n = a.rows().length, page = Math.max(1, a.size.rows - 6);
  if (k.name === "down" || r === "j") a.diffTop++;
  else if (k.name === "up" || r === "k") a.diffTop--;
  else if (k.name === "pagedown" || r === "f" || r === " ") a.diffTop += page;
  else if (k.name === "pageup" || r === "b") a.diffTop -= page;
  else if (k.name === "home" || r === "g") a.diffTop = 0;
  else if (k.name === "end" || r === "G") a.diffTop = n - 1;
  else if (k.name === "right" || r === "l") a.diffLeft += 8;
  else if (k.name === "left" || r === "h") {
    if (a.diffLeft === 0) a.focus = "list";
    a.diffLeft = Math.max(0, a.diffLeft - 8);
  } else if (k.name === "esc") a.focus = "list";
  else return;
  a.diffTop = Math.max(0, Math.min(a.diffTop, n - 1));
  a.render();
}

export async function messageKey(a: App, k: Key): Promise<void> {
  if (k.name === "esc") a.focus = "list";
  else if (k.name === "enter") await commit(a);
  else if (k.name === "ctrl+j") a.message += "\n";
  else if (edit(a.message, k) !== null) a.message = edit(a.message, k)!;
  else if (k.name === "ctrl+a") await toggleAmend(a);
  else if (k.rune) a.message += k.rune;
  a.render();
}
