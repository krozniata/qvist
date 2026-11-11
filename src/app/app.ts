// The pane's state, its lifecycle, and the questions the views ask of it.
// What input does lives beside it in app/; drawing is views/'s.
import { watch, type FSWatcher } from "node:fs";
import type { Diff } from "../model/diff";
import { draw } from "../views/draw";
import * as git from "../git";
import { readEvents } from "../terminal/input";
import type { Size, Terminal } from "../terminal/term";
import type { RGB, Theme } from "../theme";
import { askColors, detectTheme } from "./colors";
import { dropFileDiffs, loadDiff } from "./diffs";
import { handle } from "./input";
import { remote } from "./remote";

export type Tab = "changes" | "history" | "config";
export const tabs: Tab[] = ["changes", "history", "config"];
export type Focus = "list" | "diff" | "message";

// Item is one row of the changes list: a section header or a file.
export type Item = { kind: "header"; staged: boolean; count: number } | { kind: "file"; change: git.Change };

export type Confirm = { question: string; yes: () => Promise<void> };

// Prompt is a one-line field in the footer, for a branch name or a value.
export type Prompt = { label: string; value: string; placeholder?: string; allowEmpty?: boolean; submit: (value: string) => Promise<void> };

// ConfigRow is one row of the Config tab: a section header or an entry.
export type ConfigRow = { kind: "section"; name: string } | { kind: "entry"; entry: git.Entry };
export const scopes: git.Scope[] = ["global", "local", "system"];

// Picker is the branch picker that drops down from the header's branch.
// In "switch" it switches branches; in "base" it picks the branch a new one
// starts from.
export type Picker = { mode: "switch" | "base"; query: string; sel: number; top: number; branches: git.Branch[] };
export type PickerItem = { kind: "branch"; branch: git.Branch } | { kind: "create"; name: string } | { kind: "createFrom"; name: string };

const themeEvery = 2000;
const firstFetchAfter = 4000;
const fetchEvery = 3 * 60 * 1000;
const statusTime = 4000;

export class App {
  t: Terminal;
  size: Size;
  theme!: Theme;
  repo: string | null = null;
  name = "";
  tab: Tab = "changes";
  focus: Focus = "list";
  status: git.Status | null = null;
  identity: git.Identity | null = null;
  items: Item[] = [];
  sel = 0; // index into items
  listTop = 0; // in drawn rows, spacers included
  // rowMap maps a screen row to the list item drawn there, set by each draw,
  // so a click finds its item however the list is spaced.
  rowMap = new Map<number, number>();
  // padRows are those of them that are the air around an item, not the item.
  padRows = new Set<number>();
  // Where draw put the header's branch and the picker, for clicks.
  branchSpan: [number, number] = [0, 0];
  scopeSpans: [number, number][] = [];
  scopeRow = -1;
  pickerRect: [row: number, col: number, rows: number, cols: number] = [0, 0, 0, 0];
  pickerRows = new Map<number, number>();
  pickerHit(x: number, y: number): boolean {
    const [r, c, h, w] = this.pickerRect;
    return y >= r && y < r + h && x >= c && x < c + w;
  }
  diff: Diff | null = null;
  diffKey = "";
  diffTop = 0;
  diffLeft = 0;
  sizeTimer?: ReturnType<typeof setInterval>;
  loading = false; // reading the repository for the first time
  spin = 0; // the loading spinner's frame
  split = false;
  // full shows every unmodified line of the file, not just those around changes.
  full = true;
  // anchor is the line number to keep at the diff's top once it reloads, or
  // -1 to bring the file's first change into view.
  anchor = 0;
  // follow keeps the selection in view; the wheel turns it off to scroll
  // past it, and the next key or click turns it back on.
  follow = true;
  message = "";
  amend = false;
  confirm: Confirm | null = null;
  prompt: Prompt | null = null;
  picker: Picker | null = null;
  // Where draw put the open popup and its fields' top rows, for clicks.
  popupRect: [row: number, col: number, rows: number, cols: number] = [0, 0, 0, 0];
  popupFields: number[] = [];
  // History
  commits: git.Commit[] = [];
  hsel = 0;
  htop = 0;
  files: git.CommitFile[] = [];
  fsel = 0;
  ftop = 0;
  // Remotes: syncing names what is running, for the button to say.
  remotes: string[] = [];
  syncing: "fetch" | "pull" | "push" | "sync" | null = null;
  fetchTimer: ReturnType<typeof setTimeout> | undefined;
  // The terminal's colours as last reported, asked again every two seconds:
  // a terminal's word of theme changes (2031) only covers dark against light,
  // not one dark theme for another.
  // Keyed by what was asked: "11" the background, "10" the foreground, and
  // "4;1" to "4;4" the palette's red, green, yellow and blue.
  colors = new Map<string, RGB>();
  themeTimer: ReturnType<typeof setInterval> | undefined;
  recolor = false;
  // Branches
  // Config
  scope: git.Scope = "global";
  configRows: ConfigRow[] = [];
  csel = 0;
  ctop = 0;
  note = "";
  noteError = false;
  noteUntil = 0;
  watcher: FSWatcher | null = null;
  refreshTimer: ReturnType<typeof setTimeout> | undefined;
  // The paths the watcher saw change since the last refresh it asked for.
  changed = new Set<string>();
  busy = Promise.resolve();
  quit!: () => void;

  constructor(t: Terminal) {
    this.t = t;
    this.size = t.size();
  }

  // ── lifecycle ──

  async start(dir: string): Promise<void> {
    // The pane may still be settling to its size while the theme and the
    // repository load, so watch for resizes from the start and measure again
    // before anything draws.
    process.on("SIGWINCH", () => this.measure());
    // Reading the repository doesn't need the theme, so it goes on while the
    // terminal answers about its colours.
    const opened = this.open(dir);
    this.theme = await detectTheme(this);
    this.measure();
    // A new split starts as the default 80×24 and takes its real size a moment
    // later, so draw nothing at the default until it has had that moment. A
    // terminal that really is 80×24 never changes, so once the repository is
    // read the wait is cut short rather than run its length.
    let read = false;
    void opened.then(() => (read = true));
    for (let waited = 0; waited < 1500 && !(read && waited >= 250) && this.size.cols === 80 && this.size.rows === 24; waited += 25) {
      await Bun.sleep(25);
      this.measure();
    }
    // Until the first refresh is in, show that qvist is working. It goes in
    // line with the watcher's refreshes, and should one have gone first, the
    // status read at the start is older than its own and is read again.
    this.loading = true;
    const spinning = setInterval(() => (this.spin++, this.render()), 80);
    this.render();
    const first = await opened;
    try {
      await new Promise<void>((done) => this.serial(() => this.refresh(true, this.status ? null : first).finally(done)));
    } finally {
      clearInterval(spinning);
      this.loading = false;
      this.render();
    }
    // A fetch brings the ↓ count up to date: the first a few seconds in, so it
    // won't compete with the first diff, and then every few minutes.
    if (this.remotes.length > 0) {
      this.fetchTimer = setTimeout(() => {
        void remote(this, "fetch", true);
        this.fetchTimer = setInterval(() => void remote(this, "fetch", true), fetchEvery);
      }, firstFetchAfter);
    }
  }

  // open finds the repository, then reads its remotes and status together. It
  // answers the status read, or null when there is none to give; a failure
  // is said on screen, since nothing waits on this yet to catch it.
  private async open(dir: string): Promise<[git.Status, git.Identity | null] | null> {
    let repo: string;
    try {
      repo = await git.topLevel(dir);
    } catch {
      this.flash(`${dir} is not in a git repository`, true);
      return null;
    }
    this.repo = repo;
    this.name = repo.split("/").pop() ?? repo;
    // Watching starts before the status is read, so a change made while it
    // is read still brings a refresh.
    this.watch();
    try {
      const [remotes, read] = await Promise.all([git.remotes(repo).catch(() => []), this.read()]);
      this.remotes = remotes;
      return read;
    } catch (err) {
      this.flash(err instanceof Error ? err.message : String(err), true);
      return null;
    }
  }

  run(): Promise<void> {
    return new Promise((resolve) => {
      this.quit = resolve;
      readEvents(process.stdin, (ev) => this.serial(() => handle(this, ev)));
      this.t.enableInput();
      this.themeTimer = setInterval(() => askColors(this), themeEvery);
      // A split can settle to its size, or its pixel size, without a signal
      // reaching us, so look again now and then rather than trust one.
      this.sizeTimer = setInterval(() => this.measure(), 250);
      this.render();
    });
  }

  stop(): void {
    this.suspended = true;
    this.watcher?.close();
    clearTimeout(this.fetchTimer);
    clearInterval(this.fetchTimer);
    clearInterval(this.themeTimer);
    clearInterval(this.sizeTimer);
  }

  // measure reads the terminal's size and draws again if it changed.
  measure(): void {
    const was = this.size, now = this.t.size();
    this.size = now;
    if (was.rows !== now.rows || was.cols !== now.cols || was.width !== now.width || was.height !== now.height) this.render();
  }

  // serial runs input handlers one at a time, so a slow git call never
  // interleaves with the next key.
  serial(fn: () => Promise<void> | void): void {
    this.busy = this.busy.then(fn).catch((err) => this.flash(err instanceof Error ? err.message : String(err), true));
  }

  // watch refreshes after anything in the work tree or .git changes, so the
  // list follows edits, checkouts and commits made elsewhere, as VS Code does.
  watch(): void {
    try {
      this.watcher = watch(this.repo!, { recursive: true }, (_e, file) => {
        if (file && /(^|\/)\.git\/(objects|logs)\//.test(file)) return;
        this.changed.add(file ?? "");
        clearTimeout(this.refreshTimer);
        this.refreshTimer = setTimeout(() => this.serial(() => this.refreshChanged()), 150);
      });
    } catch {}
  }

  // ── data ──

  // refreshChanged refreshes for what the watcher saw, unless git ignores all
  // of it, as a build or an install writes thousands of files nothing shows.
  async refreshChanged(): Promise<void> {
    const files = [...this.changed];
    this.changed.clear();
    // The repository's own config may name who commits.
    if (files.includes(".git/config")) this.identity = null;
    // A change in .git, or one the watcher couldn't name, always counts.
    const inGit = files.some((f) => f === "" || f === ".git" || f.startsWith(".git/"));
    // A fetch only moves the remote branches, which leaves every diff as it was.
    const fetched = files.every((f) => /^\.git\/(FETCH_HEAD|packed-refs|refs\/remotes\/.*)$/.test(f));
    // A change in the work tree alone leaves the other files' diffs as they were.
    if (inGit || !(await git.allIgnored(this.repo!, files))) await this.refresh(!fetched, null, inGit ? undefined : files);
  }

  // read answers the status and who commits. Who commits is read again only
  // after a change to config cleared it.
  private read(): Promise<[git.Status, git.Identity | null]> {
    return Promise.all([git.status(this.repo!), this.identity ?? git.identity(this.repo!).catch(() => null)]);
  }

  // refresh reads the status again and, unless diffs is false, the diff on
  // screen too, dropping the files' diffs built before: those of the paths
  // given, or all of them. A fetch changes neither, so after one they are
  // kept, and with them the files' loaded diffs.
  async refresh(diffs = true, read: [git.Status, git.Identity | null] | null = null, paths?: string[]): Promise<void> {
    if (!this.repo) return this.render();
    const keep = this.current();
    [this.status, this.identity] = read ?? (await this.read());
    if (diffs) dropFileDiffs(this, paths);
    this.items = [];
    const s = this.status;
    if (s.staged.length > 0) {
      this.items.push({ kind: "header", staged: true, count: s.staged.length });
      for (const c of s.staged) this.items.push({ kind: "file", change: c });
    }
    this.items.push({ kind: "header", staged: false, count: s.changes.length });
    for (const c of s.changes) this.items.push({ kind: "file", change: c });
    // Keep the same file selected, or the row where it was.
    const again = keep ? this.items.findIndex((i) => i.kind === "file" && i.change.path === keep.path && i.change.staged === keep.staged) : -1;
    this.sel = again >= 0 ? again : Math.min(this.sel, this.items.length - 1);
    if (this.items[this.sel]?.kind !== "file") this.moveSel(1, false);
    await this.loadTab();
    await loadDiff(this, diffs);
    this.render();
  }

  // loadTab reads what the tab on screen shows besides the status.
  async loadTab(): Promise<void> {
    if (this.tab === "history") {
      const keep = this.commits[this.hsel]?.sha;
      this.commits = await git.log(this.repo!);
      const again = this.commits.findIndex((c) => c.sha === keep);
      this.hsel = again >= 0 ? again : Math.min(this.hsel, Math.max(0, this.commits.length - 1));
    } else if (this.tab === "config") {
      await this.loadConfig();
    }
  }

  async loadConfig(): Promise<void> {
    const keep = this.configEntry()?.key;
    const entries = await git.config(this.repo, this.scope);
    this.configRows = [];
    let section = "";
    for (const e of entries) {
      if (e.section !== section) this.configRows.push({ kind: "section", name: (section = e.section) });
      this.configRows.push({ kind: "entry", entry: e });
    }
    const again = this.configRows.findIndex((r) => r.kind === "entry" && r.entry.key === keep);
    this.csel = again >= 0 ? again : Math.min(this.csel, this.configRows.length - 1);
    if (this.configRows[this.csel]?.kind !== "entry") this.csel = this.configRows.findIndex((r) => r.kind === "entry");
  }

  configEntry(): git.Entry | null {
    const r = this.configRows[this.csel];
    return r?.kind === "entry" ? r.entry : null;
  }

  async setTab(tab: Tab): Promise<void> {
    if (tab === this.tab) return;
    this.tab = tab;
    this.focus = "list";
    this.diffKey = "";
    await this.refresh();
  }

  current(): git.Change | null {
    const it = this.items[this.sel];
    return it?.kind === "file" ? it.change : null;
  }

  // Diffs, and a commit's files, load in the background, so moving the
  // selection never waits for git or the highlighter: the newest request
  // wins and older answers are dropped. Commits never change, so their
  // diffs stay cached; the work tree's are read again on every refresh.
  diffLoading = false;
  diffSlow = false; // still loading after a moment: say so rather than show the last diff
  diffToken = 0;
  diffCache = new Map<string, Diff>();
  filesCache = new Map<string, git.CommitFile[]>();
  filesOf = "";

  rows() {
    return this.diff ? (this.split ? this.diff.split : this.diff.unified) : [];
  }

  context(): number {
    return this.full ? 1_000_000 : 3;
  }

  // ── feedback ──

  flash(text: string, error = false): void {
    this.note = text;
    this.noteError = error;
    this.noteUntil = Date.now() + statusTime;
    this.render();
    setTimeout(() => this.render(), statusTime + 50);
  }

  // render draws once the work of the moment is done, so the several changes
  // one key makes send one frame; suspended holds frames back while
  // something else has the terminal.
  render(): void {
    if (this.renderQueued) return;
    this.renderQueued = true;
    setImmediate(() => {
      this.renderQueued = false;
      if (this.theme && !this.suspended) draw(this);
    });
  }
  renderQueued = false;
  suspended = false;

  // pickerItems are, when switching, the two ways to create a branch, then
  // the branches matching the query, local ones first, the current one at
  // the top and the rest by latest commit, as git lists them.
  pickerItems(): PickerItem[] {
    const p = this.picker!, q = p.query.trim().toLowerCase();
    const match = (b: git.Branch) => q === "" || b.name.toLowerCase().includes(q);
    const branches: PickerItem[] = [
      ...p.branches.filter((b) => b.current && match(b)),
      ...p.branches.filter((b) => !b.current && !b.remote && match(b)),
      ...p.branches.filter((b) => b.remote && match(b)),
    ].map((branch) => ({ kind: "branch", branch }));
    if (p.mode === "base") return branches;
    return [{ kind: "create", name: p.query.trim() }, { kind: "createFrom", name: p.query.trim() }, ...branches];
  }
  pendingName = "";

  // ── list movement ──

  moveSel(d: number, render = true): void {
    let i = this.sel;
    for (;;) {
      i += d;
      if (i < 0 || i >= this.items.length) break;
      if (this.items[i].kind === "file") {
        this.sel = i;
        break;
      }
    }
    if (render) this.render();
  }

  selectFile(n: number): void {
    const files = this.items.map((it, i) => (it.kind === "file" ? i : -1)).filter((i) => i >= 0);
    if (files.length > 0) this.sel = files[Math.max(0, Math.min(n, files.length - 1))];
  }

  // publishTo answers where a branch that tracks nothing would be pushed:
  // origin, or the only remote there is.
  publishTo(): { remote: string; branch: string } | null {
    const s = this.status;
    if (!s || s.upstream || s.detached || s.branch === "" || this.remotes.length === 0) return null;
    const remote = this.remotes.includes("origin") ? "origin" : this.remotes[0];
    return { remote, branch: s.branch };
  }

  // syncWhat answers what the sync button would do now, or null when the
  // branch is level with its remote.
  syncWhat(): "push" | "pull" | "sync" | null {
    const s = this.status;
    if (!s || s.detached) return null;
    if (this.publishTo()) return "push";
    if (!s.upstream) return null;
    return s.ahead && s.behind ? "sync" : s.ahead ? "push" : s.behind ? "pull" : null;
  }
}
