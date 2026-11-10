import { describe, expect, test } from "bun:test";
import type { Commit } from "../src/git";
import { layoutGraph } from "../src/model/graph";

const commit = (sha: string, ...parents: string[]): Commit => ({ sha, short: sha, subject: sha, body: "", author: "", email: "", at: 0, refs: "", parents });

describe("layoutGraph", () => {
  test("keeps a straight history in one lane", () => {
    const g = layoutGraph([commit("c", "b"), commit("b", "a"), commit("a")]);
    expect(g.lanes).toBe(1);
    expect(g.rows.map((r) => r.lane)).toEqual([0, 0, 0]);
    expect(g.rows[0].down).toEqual([{ from: 0, to: 0, color: 0 }]);
    expect(g.rows[2].down).toEqual([]);
  });

  test("gives a merged branch its own lane, which joins back at its fork", () => {
    // m merges f into main; f and b both come from a.
    const g = layoutGraph([commit("m", "b", "f"), commit("f", "a"), commit("b", "a"), commit("a")]);
    expect(g.lanes).toBe(2);
    expect(g.rows.map((r) => [r.lane, r.merge])).toEqual([[0, true], [1, false], [0, false], [0, false]]);
    // The merge sends a line down each lane, in a colour of its own.
    expect(g.rows[0].down.map((e) => [e.from, e.to])).toEqual([[0, 0], [0, 1]]);
    expect(new Set(g.rows[0].down.map((e) => e.color)).size).toBe(2);
    // The branch's lane curves into a's dot.
    expect(g.rows[2].down).toContainEqual({ from: 1, to: 0, color: g.rows[1].color });
  });

  test("starts a branch tip nothing leads to on a free lane", () => {
    const g = layoutGraph([commit("x", "a"), commit("y", "a"), commit("a")]);
    expect(g.rows.map((r) => r.lane)).toEqual([0, 1, 0]);
  });
});
