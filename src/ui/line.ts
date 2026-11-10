// Lines are the rows everything is drawn from: a run of styled text a fixed
// number of columns wide, padded with its background so nothing stale shows.
// The other kinds wrap one: inset it, round its ends, or put two side by side.
import { bg, fg, isClear, type RGB } from "../theme";
import { width } from "./text";

// Powerline half-circles, which Rex's terminal draws itself.
export const capLeft = "", capRight = "";

export type Style = { bg?: RGB; bold?: boolean };

// Text comes from repositories: names, messages and code anyone could have
// written. Its control characters would reach the terminal as commands, such
// as one that writes the clipboard, so each shows as � instead.
const controls = /[\x00-\x1f\x7f-\x9f]/g;

export class Line {
  private out = "";
  private used = 0;
  constructor(private cols: number, readonly base: RGB) {}
  add(text: string, color: RGB, opts: Style = {}): this {
    const room = this.cols - this.used;
    if (room <= 0 || text === "") return this;
    text = text.replace(controls, "�");
    const shown = width(text) > room ? [...text].slice(0, room).join("") : text;
    this.out += `\x1b[${opts.bold ? "1" : "22"}m${bg(opts.bg ?? this.base)}${fg(color)}${shown}`;
    this.used += width(shown);
    return this;
  }
  pad(n: number): this {
    return this.add(" ".repeat(Math.max(0, n)), this.base);
  }
  // pill draws text on a rounded fill.
  pill(text: string, color: RGB, fill: RGB, bold = false): this {
    return this.add(capLeft, fill).add(text, color, { bg: fill, bold }).add(capRight, fill);
  }
  // right pads so that text ends at the row's last column.
  right(text: string, color: RGB, opts: Style = {}): this {
    this.pad(this.cols - this.used - width(text));
    return this.add(text, color, opts);
  }
  rightPill(text: string, color: RGB, fill: RGB, trail = 0): this {
    this.pad(this.cols - this.used - width(text) - 2 - trail);
    return this.pill(text, color, fill).pad(trail);
  }
  get left(): number {
    return this.cols - this.used;
  }
  toString(): string {
    return this.out + bg(this.base) + " ".repeat(Math.max(0, this.cols - this.used)) + "\x1b[22m";
  }
}

export const blank = (cols: number, color: RGB) => new Line(cols, color);

// Raw is a line already drawn, such as a card's edge.
export class Raw extends Line {
  constructor(private text: string, cols: number, base: RGB) {
    super(cols, base);
  }
  override toString(): string {
    return this.text;
  }
}

// Joined puts two lines side by side, for the split diff.
export class Joined extends Line {
  constructor(private l: Line, private r: Line) {
    super(0, l.base);
  }
  override toString(): string {
    return this.l.toString() + this.r.toString();
  }
}

// Padded insets a line with `padding` columns of base either side.
export class Padded extends Line {
  constructor(private inner: Line, base: RGB, private padding = 1) {
    super(0, base);
  }
  override toString(): string {
    const p = `${bg(this.base)}${" ".repeat(this.padding)}`;
    return p + this.inner.toString() + p;
  }
}

// Rounded gives a line pill ends: its fill rounded off against base.
export class Rounded extends Line {
  constructor(private inner: Line, base: RGB) {
    super(0, base);
  }
  override toString(): string {
    // A clear fill has no ends to round: drawn, they would show as ink.
    const f = this.inner.base, [l, r] = isClear(f) ? [" ", " "] : [capLeft, capRight];
    return `${bg(this.base)}${fg(f)}${l}${this.inner.toString()}${bg(this.base)}${fg(f)}${r}`;
  }
}

// row makes a row `cols` wide inset a column on base. With a fill it is a
// pill, or with square a plain band whose rounding is in the tile edges
// around it. build draws its content.
export function row(cols: number, base: RGB, fill: RGB | null, build: (l: Line) => Line, square = false): Line {
  if (!fill) return new Padded(build(new Line(cols - 2, base)), base);
  if (square) return new Padded(build(new Line(cols - 2, fill)), base);
  return new Padded(new Rounded(build(new Line(cols - 4, fill)), base), base);
}
