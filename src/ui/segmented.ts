// A segmented control: options side by side, the chosen one a pill in the
// accent's container colour. It answers where each option was drawn, for clicks.
import type { Theme } from "../theme";
import type { Line } from "./line";

// key, when set, is the shortcut that picks the option, drawn dimmed before it.
export type Segment = { label: string; on: boolean; disabled?: boolean; key?: string };

export function segmented(l: Line, t: Theme, options: Segment[], start: number): [from: number, to: number][] {
  const spans: [number, number][] = [];
  let x = start;
  for (const o of options) {
    const text = o.key ? `${o.key} ${o.label}` : o.label;
    if (o.on) l.pill(text, t.accentOnContainer, t.accentContainer, true);
    else if (o.key) l.add(` ${o.key}`, t.tertiary).add(` ${o.label} `, o.disabled ? t.tertiary : t.secondary);
    else l.add(` ${o.label} `, o.disabled ? t.tertiary : t.secondary);
    spans.push([x, x + text.length + 2]);
    x += text.length + 3;
    l.add(" ", t.content);
  }
  return spans;
}
