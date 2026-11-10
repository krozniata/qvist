// Writes THIRD_PARTY_NOTICES: the licence of every package bundled into the
// qvist binary, found from what the bundler actually pulls in.
//
//   bun script/notices.ts          writes it
//   bun script/notices.ts --check  fails if it is out of date
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const out = join(root, "THIRD_PARTY_NOTICES");

const build = await Bun.build({ entrypoints: [join(root, "src/main.ts")], target: "bun", metafile: true });
if (!build.success) throw new AggregateError(build.logs, "bundling failed");
const names = new Set<string>();
for (const input of Object.keys(build.metafile!.inputs)) {
  const m = /node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(input);
  if (m) names.add(m[1]);
}

const sections = [...names].sort().map((name) => {
  const dir = join(root, "node_modules", name);
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const repo = typeof pkg.repository === "string" ? pkg.repository : (pkg.repository?.url ?? pkg.homepage ?? "");
  const files = readdirSync(dir).filter((f) => /^(licen[cs]e|notice)/i.test(f)).sort();
  if (files.length === 0) throw new Error(`${name} ships no licence file`);
  const texts = files.map((f) => readFileSync(join(dir, f), "utf8").trim());
  return [`${name} ${pkg.version} (${pkg.license})`, repo.replace(/^git\+/, "")].filter(Boolean).join("\n") + "\n\n" + texts.join("\n\n");
});
const rule = "\n\n" + "-".repeat(80) + "\n";
const text = "qvist includes code from the following projects." + rule + sections.join(rule) + "\n";

if (process.argv.includes("--check")) {
  if (!existsSync(out) || readFileSync(out, "utf8") !== text) {
    console.error("THIRD_PARTY_NOTICES is out of date: run bun script/notices.ts");
    process.exit(1);
  }
} else {
  writeFileSync(out, text);
  console.log(`wrote ${out}: ${names.size} packages`);
}
