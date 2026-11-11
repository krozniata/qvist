// Building diffs on the worker thread, or here when there is none.
//
// Only the latest request matters: moving through files quickly leaves the
// ones passed unwanted, so a new request takes the place of the one running,
// which comes back null, and the worker drops it between its pieces.
import { paint, type Coloured } from "./chunks";
import { buildDiff, type Diff } from "./diff";

type Reply =
  | { id: number; kind: "diff"; diff: Diff; complete: boolean }
  | ({ id: number; kind: "spans" } & Coloured)
  | { id: number; kind: "done" }
  | { id: number; kind: "error"; error: string };

// Watch is told of a diff as soon as there are rows to show, and again as
// each piece of it is coloured.
export type Watch = { show?: (d: Diff) => void; progress?: () => void };
type Job = Watch & { id: number; path: string; patch: string; diff?: Diff; done: (d: Diff | null) => void; fail: (e: Error) => void };

let worker: Worker | null = null;
// noWorker is set once a worker failed before it ever answered, as one does
// that can't be loaded at all; from then on diffs are built here.
let noWorker = false;
let next = 0;
let running: Job | null = null;

// warmWorker has the worker ready, with its grammars loaded, before it is asked.
export function warmWorker(): void {
  if (noWorker) return;
  try {
    worker ??= spawn();
  } catch {}
}

function spawn(): Worker {
  // Compiled, the bundle's root is the folder of the entry points, not this
  // file's, and the worker sits in model/ under it.
  const compiled = import.meta.url.includes("$bunfs");
  const w = new Worker(new URL(compiled ? "./model/diffworker.ts" : "./diffworker.ts", import.meta.url));
  let answered = false;
  w.onmessage = (e: MessageEvent<Reply>) => {
    answered = true;
    const m = e.data, job = running;
    if (w !== worker || !job || job.id !== m.id) return;
    if (m.kind === "diff") {
      job.diff = m.diff;
      job.show?.(m.diff);
      if (m.complete) finish(job);
    } else if (m.kind === "spans") {
      if (job.diff) paint(job.diff, m);
      job.progress?.();
    } else if (m.kind === "done") finish(job);
    else {
      running = null;
      job.fail(new Error(m.error));
    }
  };
  // A worker that dies fails its job, and the next request gets a new worker.
  // One that never answered won't load, so its job, and every one after, is
  // built here instead. One that was stopped on purpose may still report, and
  // is ignored.
  w.onerror = (e) => {
    if (w !== worker) return;
    w.terminate();
    worker = null;
    const job = running;
    running = null;
    if (!answered) {
      noWorker = true;
      if (job) buildHere(job);
    } else job?.fail(new Error(`diff worker stopped: ${e.message || "no reason given"}`));
  };
  return w;
}

function buildHere(job: Job): void {
  buildDiff(job.path, job.patch).then((d) => (job.show?.(d), job.done(d)), job.fail);
}

function finish(job: Job): void {
  running = null;
  job.done(job.diff!);
}

// buildInBackground answers the rows of a patch, built on the worker, once
// all of it is coloured; null when a newer request took its place.
export function buildInBackground(path: string, patch: string, watch: Watch = {}): Promise<Diff | null> {
  return new Promise((done, fail) => {
    running?.done(null);
    const job: Job = { ...watch, id: next++, path, patch, done, fail };
    running = job;
    try {
      if (noWorker) throw new Error("no worker");
      worker ??= spawn();
    } catch {
      // No worker to be had: build it here.
      noWorker = true;
      running = null;
      buildHere(job);
      return;
    }
    worker.postMessage({ id: job.id, path, patch });
  });
}

// buildIfIdle builds a patch for later, but only while nothing else is being
// built; null when the worker was busy.
export function buildIfIdle(path: string, patch: string): Promise<Diff | null> {
  return running ? Promise.resolve(null) : buildInBackground(path, patch);
}
