// Turns a git patch into rows to draw, using Pierre's own parser and
// highlighter (@pierre/diffs with its pierre-dark and pierre-light themes),
// so syntax colours and changed-word emphasis are exactly Pierre's.
import {
  type FileDiffMetadata,
  getFiletypeFromFileName,
  getSharedHighlighter,
  parsePatchFiles,
  renderDiffWithHighlighter,
} from "@pierre/diffs";
import { hexOf, type RGB } from "../theme";

// Span is a run of text in one syntax colour; em marks a changed word.
export type Span = { text: string; dark?: RGB; light?: RGB; em: boolean };

export type LineType = "context" | "add" | "del";

export type Side = { no: number; type: LineType; spans: Span[] };

export type Row =
  | { kind: "hunk"; hunk: number; collapsed: number; context: string }
  | { kind: "line"; hunk: number; type: LineType; old: number; new: number; spans: Span[] }
  | { kind: "split"; hunk: number; left: Side | null; right: Side | null };

export type Diff = {
  path: string;
  binary: boolean;
  added: number;
  removed: number;
  hunks: number;
  unified: Row[];
  split: Row[];
};

type Hast = { type: string; value?: string; tagName?: string; properties?: Record<string, unknown>; children?: Hast[] };

const themes = { dark: "pierre-dark", light: "pierre-light" } as const;

// spansOf flattens one rendered line into its coloured runs. Tabs become
// spaces, since a terminal moves to its own tab stops.
function spansOf(node: Hast | undefined): Span[] {
  const out: Span[] = [];
  const walk = (n: Hast, dark: RGB | undefined, light: RGB | undefined, em: boolean) => {
    if (n.type === "text") {
      const text = (n.value ?? "").replaceAll("\t", "    ").replace(/\r?\n$/, "");
      if (text !== "") out.push({ text, dark, light, em });
      return;
    }
    const p = n.properties ?? {};
    const style = typeof p.style === "string" ? p.style : "";
    const d = /--diffs-token-dark:(#[0-9a-fA-F]{6})/.exec(style)?.[1];
    const l = /--diffs-token-light:(#[0-9a-fA-F]{6})/.exec(style)?.[1];
    for (const c of n.children ?? []) walk(c, d ? hexOf(d) : dark, l ? hexOf(l) : light, em || "data-diff-span" in p);
  };
  if (node) walk(node, undefined, undefined, false);
  return out;
}

async function highlight(file: FileDiffMetadata) {
  const lang = getFiletypeFromFileName(file.name);
  try {
    const hl = await getSharedHighlighter({ themes: [themes.dark, themes.light], langs: [lang] } as never);
    return renderDiffWithHighlighter(file, hl, { theme: themes, lineDiffType: "word-alt" } as never).code;
  } catch {
    const hl = await getSharedHighlighter({ themes: [themes.dark, themes.light], langs: [] } as never);
    return renderDiffWithHighlighter(file, hl, { theme: themes } as never, { forcePlainText: true }).code;
  }
}

// warmUp loads the highlighter and the common languages' grammars ahead of
// the first diff, so it doesn't pay for them.
export function warmUp(): void {
  const langs = ["typescript", "tsx", "javascript", "json", "markdown", "python", "swift", "rust", "go", "css", "html", "shellscript", "yaml", "lua"];
  getSharedHighlighter({ themes: [themes.dark, themes.light], langs } as never).catch(() => {});
}

export async function buildDiff(path: string, patch: string): Promise<Diff> {
  const empty: Diff = { path, binary: false, added: 0, removed: 0, hunks: 0, unified: [], split: [] };
  if (/^Binary files .* differ$/m.test(patch)) return { ...empty, binary: true };
  const file = parsePatchFiles(patch)[0]?.files[0];
  if (!file || file.hunks.length === 0) return empty;
  const code = await highlight(file);
  const del = (i: number) => spansOf(code.deletionLines[i] as Hast | undefined);
  const add = (i: number) => spansOf(code.additionLines[i] as Hast | undefined);

  const d: Diff = { ...empty, hunks: file.hunks.length };
  file.hunks.forEach((h, hi) => {
    const sep: Row = { kind: "hunk", hunk: hi, collapsed: h.collapsedBefore, context: h.hunkContext ?? "" };
    d.unified.push(sep);
    d.split.push(sep);
    let oldNo = h.deletionStart, newNo = h.additionStart;
    for (const block of h.hunkContent) {
      if (block.type === "context") {
        for (let i = 0; i < block.lines; i++) {
          const spans = add(block.additionLineIndex + i);
          d.unified.push({ kind: "line", hunk: hi, type: "context", old: oldNo, new: newNo, spans });
          const side = (no: number): Side => ({ no, type: "context", spans });
          d.split.push({ kind: "split", hunk: hi, left: side(oldNo), right: side(newNo) });
          oldNo++;
          newNo++;
        }
        continue;
      }
      const dels: Side[] = [], adds: Side[] = [];
      for (let i = 0; i < block.deletions; i++) {
        const spans = del(block.deletionLineIndex + i);
        d.unified.push({ kind: "line", hunk: hi, type: "del", old: oldNo, new: 0, spans });
        dels.push({ no: oldNo++, type: "del", spans });
      }
      for (let i = 0; i < block.additions; i++) {
        const spans = add(block.additionLineIndex + i);
        d.unified.push({ kind: "line", hunk: hi, type: "add", old: 0, new: newNo, spans });
        adds.push({ no: newNo++, type: "add", spans });
      }
      d.removed += dels.length;
      d.added += adds.length;
      for (let i = 0; i < Math.max(dels.length, adds.length); i++) {
        d.split.push({ kind: "split", hunk: hi, left: dels[i] ?? null, right: adds[i] ?? null });
      }
    }
  });
  return d;
}
