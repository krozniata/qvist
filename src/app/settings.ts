// The Config tab's commands: moving between settings and scopes, and
// editing a scope's file.
import * as git from "../git";
import { forget } from "../ui/frame";
import { invalidate } from "../views/draw";
import { type App, scopes } from "./app";

export function moveConfig(a: App, d: number): void {
  for (let i = a.csel + d; i >= 0 && i < a.configRows.length; i += d) {
    if (a.configRows[i].kind === "entry") return void (a.csel = i);
  }
}

export async function setScope(a: App, d: number): Promise<void> {
  let i = scopes.indexOf(a.scope);
  do i = (i + d + scopes.length) % scopes.length;
  while (scopes[i] === "local" && !a.repo);
  await chooseScope(a, scopes[i]);
}

// chooseScope shows one scope's settings; Repository needs a repository.
export async function chooseScope(a: App, sc: git.Scope): Promise<void> {
  if (sc === "local" && !a.repo) return a.flash("Open a repository to see its settings", true);
  [a.scope, a.csel, a.ctop] = [sc, 0, 0];
  await a.loadConfig();
}

// editConfigFile opens a copy of the scope's file in $EDITOR, in a
// terminal, and keeps it only if git can still read it, so a typo never
// leaves git unable to start.
export async function editConfigFile(a: App): Promise<void> {
  if (a.scope === "system") return a.flash("System config is read-only here", true);
  const path = await git.configPath(a.repo, a.scope);
  const draft = `${path}.qvist`;
  const file = Bun.file(path);
  await Bun.write(draft, (await file.exists()) ? await file.text() : "");
  const editor = process.env.VISUAL || process.env.EDITOR || "vi";
  // The editor has the terminal until it exits; frames wait.
  a.suspended = true;
  a.t.close();
  const code = await Bun.spawn(["sh", "-c", `${editor} "$1"`, "sh", draft], { stdio: ["inherit", "inherit", "inherit"] }).exited;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  a.t.write("\x1b[?1049h\x1b[?25l");
  a.t.enableInput();
  // Leaving cleared the screen and its images: send everything again.
  a.suspended = false;
  invalidate();
  forget();
  a.render();
  try {
    if (code !== 0) return a.flash(`${editor} exited with ${code}; the file is unchanged`, true);
    const problem = await git.checkConfig(draft);
    if (problem) return a.flash(`Not saved: ${problem}`, true);
    await Bun.write(path, await Bun.file(draft).text());
    a.identity = null;
    await a.loadConfig();
    a.flash(`Saved ${path}`);
  } finally {
    await Bun.file(draft).delete().catch(() => {});
  }
}
