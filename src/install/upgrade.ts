// Replacing qvist with its latest release, and telling when there is one.
import { createHash } from "node:crypto";
import { mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { run } from "../exec";

const repo = "krozniata/qvist";
const asset = "qvist-darwin-arm64.tar.gz";

// newer answers whether version a comes after b, comparing them part by part.
export function newer(a: string, b: string): boolean {
  const parts = (v: string) => v.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

// GitHub redirects /releases/latest to the newest release's tag.
async function latestVersion(signal?: AbortSignal): Promise<string> {
  const res = await fetch(`https://github.com/${repo}/releases/latest`, { redirect: "manual", signal });
  const tag = /\/tag\/v?([^/]+)$/.exec(res.headers.get("location") ?? "")?.[1];
  if (!tag) throw new Error(`couldn't find the latest release of ${repo} (HTTP ${res.status})`);
  return tag;
}

// availableUpgrade answers a newer release's version, or null when there is
// none or it can't tell.
export async function availableUpgrade(current: string): Promise<string | null> {
  if (current === "dev") return null;
  try {
    const latest = await latestVersion(AbortSignal.timeout(10_000));
    return newer(latest, current) ? latest : null;
  } catch {
    return null;
  }
}

async function download(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`couldn't download ${url} (HTTP ${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

// upgrade replaces the running qvist with the latest release, unless it is
// the latest already, and adds the new one to Rex.
export async function upgrade(current: string): Promise<void> {
  const bin = process.execPath;
  if (current === "dev") throw new Error("only a released qvist can upgrade itself");
  const latest = await latestVersion();
  if (!newer(latest, current)) return console.log(`qvist ${current} is the latest version`);

  const url = `https://github.com/${repo}/releases/download/v${latest}`;
  console.log(`downloading ${url}/${asset}`);
  const tar = await download(`${url}/${asset}`);
  const sum = new TextDecoder().decode(await download(`${url}/${asset}.sha256`)).trim().split(/\s+/)[0];
  if (createHash("sha256").update(tar).digest("hex") !== sum) throw new Error("the download has the wrong checksum");

  // macOS kills a running qvist whose file is overwritten in place, so the
  // new one is unpacked beside it and moved over it.
  const tmp = mkdtempSync(join(dirname(bin), ".qvist-"));
  try {
    writeFileSync(join(tmp, asset), tar);
    const r = await run(["tar", "-xzf", join(tmp, asset), "-C", tmp, "qvist"]);
    if (r.code !== 0) throw new Error(`couldn't unpack the download: ${r.err.trim()}`);
    renameSync(join(tmp, "qvist"), bin);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`upgraded ${bin} from ${current} to ${latest}`);

  const r = await run([bin, "install"]);
  if (r.code !== 0) throw new Error(`the new qvist failed to install: ${(r.out + r.err).trim()}`);
  console.log(r.out.trimEnd());
}
