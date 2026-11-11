// Measuring and cutting text by terminal columns: one per code point, which
// holds for the text qvist draws.

export const width = (s: string) => [...s].length;

// clip cuts s to n columns, ending in … when it had to cut.
export function clip(s: string, n: number): string {
  if (n <= 0) return "";
  const r = [...s];
  return r.length <= n ? s : r.slice(0, Math.max(0, n - 1)).join("") + "…";
}

// wrap breaks text into lines of at most w columns at spaces, keeping its
// own line breaks.
export function wrap(text: string, w: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      if (line && width(line) + 1 + width(word) > w) {
        out.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    out.push(line);
  }
  return out;
}

// wrapHard breaks text into lines of at most w columns, at the last space
// that fits or mid-word when there is none, keeping its own line breaks. The
// spaces stay on the lines, so the last line is where a cursor would sit.
export function wrapHard(text: string, w: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let cur: string[] = [];
    for (const c of para) {
      if (cur.length >= w) {
        const at = cur.lastIndexOf(" ");
        if (at >= 0 && c !== " ") {
          out.push(cur.slice(0, at + 1).join(""));
          cur = cur.slice(at + 1);
        } else {
          out.push(cur.join(""));
          cur = [];
        }
      }
      cur.push(c);
    }
    out.push(cur.join(""));
  }
  return out;
}
