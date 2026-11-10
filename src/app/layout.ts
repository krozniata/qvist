// Where things are on screen, shared by drawing and clicks.
import { type App, type Tab, tabs } from "./app";

// layoutOf answers where things are on screen, for drawing and for clicks.
// The body starts on row 1 with the cards' soft top edges, so their content
// starts on row 2, one column in from the margin and the card's padding.
export function layoutOf(a: App) {
  const listCols = Math.max(28, Math.min(50, Math.round(a.size.cols * 0.32)));
  const messageRows = Math.min(4, Math.max(1, a.message.split("\n").length));
  const contentTop = 2;
  // The field's two edges and its rows, the button's tile (an edge, its
  // row, an edge), then a blank.
  // The sync button's tile follows the commit button's in a repository.
  const syncRow = a.repo ? contentTop + messageRows + 2 + 4 : -1;
  const listStart = contentTop + messageRows + 2 + 4 + (syncRow >= 0 ? 3 : 0);
  return { listCols, messageRows, listStart, syncRow, contentTop, listLeft: 1, listRight: 1 + listCols };
}

export const tabTitle: Record<Tab, string> = { changes: "Changes", history: "History", config: "Config" };

export function tabHits(a: App): { tab: Tab; from: number; to: number }[] {
  const labels = tabs.map((t, i) => ` ${i + 1} ${tabTitle[t]} `);
  let x = a.size.cols - labels.reduce((n, l) => n + l.length + 1, 0);
  return tabs.map((tab, i) => {
    const from = x;
    x += labels[i].length + 1;
    return { tab, from, to: from + labels[i].length };
  });
}
