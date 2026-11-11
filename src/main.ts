// qvist is a git client in a Rex pane: VS Code's Source Control view in the
// terminal, with Pierre's diffs, in the colours of the Rex theme around it.
import { App } from "./app/app";
import { install, uninstall } from "./install/install";
import { warmWorker } from "./model/background";
import { Terminal } from "./terminal/term";

// The release workflow defines QVIST_VERSION when it builds a release.
declare const QVIST_VERSION: string | undefined;
const version = typeof QVIST_VERSION === "string" ? QVIST_VERSION : "dev";

const usage = `usage: qvist [DIR] | qvist install | qvist uninstall
  DIR           a directory in the repository to open (default: the current one)
  install       adds qvist's action to Rex: shift+cmd+k opens it beside the focused pane
  uninstall     takes it out again
  -v, --version prints qvist's version`;

async function main(args: string[]): Promise<void> {
  if (args.some((a) => a === "-h" || a === "--help")) return console.log(usage);
  if (args.some((a) => a === "-v" || a === "--version")) return console.log(`qvist ${version}`);
  if (args[0] === "install") return install(process.execPath);
  if (args[0] === "uninstall") return uninstall();
  const dir = args.find((a) => !a.startsWith("-")) ?? process.cwd();
  // qvist draws on, and reads keys from, the terminal it runs in.
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error("qvist: run qvist in a terminal");
    process.exit(1);
  }
  // The diff worker takes a while to set up, so it starts before anything else.
  warmWorker();
  const t = Terminal.open();
  const a = new App(t);
  const done = () => {
    a.stop();
    t.close();
  };
  process.on("uncaughtException", (err) => {
    done();
    console.error("qvist:", err);
    process.exit(1);
  });
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(sig, () => (done(), process.exit(0)));
  try {
    await a.start(dir);
    await a.run();
  } finally {
    done();
  }
}

await main(process.argv.slice(2));
process.exit(0);
