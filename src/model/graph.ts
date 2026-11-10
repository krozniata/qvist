// Lays out the commit graph as the Git Graph extension draws it: each lane
// follows one line of descent, a commit is a dot on its lane, and every
// line between two commit rows is a curve from where it leaves the upper
// row to where it reaches the lower one, so branches and merges swing
// smoothly between lanes.
import type { Commit } from "../git";

// Edge runs from lane `from` at one commit's row to lane `to` at the next
// commit's row, in the colour of the line it belongs to.
export type Edge = { from: number; to: number; color: number };

// GraphRow is one commit: its dot's lane and colour, whether it is a merge,
// and the edges from its row down to the next commit's.
export type GraphRow = { lane: number; color: number; merge: boolean; down: Edge[] };

export type Graph = { rows: GraphRow[]; lanes: number };

export function layoutGraph(commits: Commit[]): Graph {
  // lanes[i] is the commit the line in lane i is heading for, or null.
  const lanes: (string | null)[] = [];
  const color: number[] = [];
  let nextColor = 0;
  let widest = 1;
  const rows: GraphRow[] = [];

  const free = () => {
    const i = lanes.indexOf(null);
    return i < 0 ? lanes.length : i;
  };

  commits.forEach((c, k) => {
    let col = lanes.indexOf(c.sha);
    if (col < 0) {
      // A commit nothing above leads to: a branch tip, on a lane of its own.
      col = free();
      lanes[col] = c.sha;
      color[col] = nextColor++;
    }
    // Every other line heading for this commit ends here.
    for (let i = 0; i < lanes.length; i++) if (i !== col && lanes[i] === c.sha) lanes[i] = null;

    // Where each line leaving this row starts: its lane, or this dot for
    // the lines to this commit's parents.
    const starts = new Map<number, number>();
    for (let i = 0; i < lanes.length; i++) if (lanes[i] !== null && i !== col) starts.set(i, i);
    const [first, ...others] = c.parents;
    lanes[col] = first ?? null;
    if (first) starts.set(col, col);
    for (const p of others) {
      let at = lanes.indexOf(p);
      if (at < 0) {
        at = free();
        lanes[at] = p;
        color[at] = nextColor++;
      }
      // A line already heading for p takes this one in; one curve is drawn
      // from the dot into that lane.
      if (!starts.has(at)) starts.set(at, col);
    }
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();
    widest = Math.max(widest, lanes.length, col + 1);

    // Where each line arrives at the next row: its lane, or the next dot
    // when that is the commit it heads for.
    const next = commits[k + 1];
    const nextCol = next ? lanes.indexOf(next.sha) : -1;
    const down: Edge[] = [];
    for (const [lane, from] of starts) {
      const to = next && lanes[lane] === next.sha ? nextCol : lane;
      down.push({ from, to, color: color[lane] });
    }
    // Lines that pass this row without meeting the dot keep going.
    rows.push({ lane: col, color: color[col], merge: c.parents.length > 1, down });
  });
  return { rows, lanes: widest };
}
