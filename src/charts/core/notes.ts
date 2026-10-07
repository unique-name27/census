/**
 * Chart annotations (docs/DESIGN-REFRESH.md 2.7, audit A13): up to two short notes per chart,
 * each tied to a datum, so the chart tells the same story as the finding that cites it ("Fell to
 * 68%, mostly Bengaluru"). A note is a 1px ink-2 leader from the datum to an 11px ink-2 label with
 * a sheet-colored halo, placed in free space near the datum (above it, beside it, wrapped to two
 * lines, or in the headroom a chart with notes reserves above its plot). When no place is free
 * (it would leave the plot, cover a mark or another note), the note is dropped: the tooltip and
 * the table still carry the number.
 *
 * Producers take the note text from the finding that cites the chart's metric:
 *
 *   <Lines data={rows} x="month" y="rate" notes={[{ at: '2026-09', text: 'Fell to 68%, mostly Bengaluru' }]} />
 *   <Columns data={rows} x="month" y="offers" notes={[{ at: '2026-09', text: '48 offers, the most in a year' }]} />
 *
 * This file is the pure placement (tested); `noteMark` in `marks.ts` draws it inside a Plot.
 */

/** A note on a chart: `at` is the datum's x (a date key, month or category; a category row for horizontal bars). */
export interface ChartNote {
  at: string | number
  /** The value the leader points at; default: the chart's own value at `at` (the top of the stack, the bar end). */
  value?: number
  /** One short clause, sentence case, no click instructions. */
  text: string
  /** For a chart with several series: the series the note points at (default: the emphasized or first one). */
  series?: string
}

/** The most notes a chart draws. */
export const MAX_NOTES = 2

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** A note resolved to the pixel it points at. */
export interface NoteAnchor {
  x: number
  y: number
  text: string
  /** Label width in px (measured by the caller with `textWidth(text, 11, 500)`). */
  width: number
}

export interface PlacedNote {
  text: string
  /** The label's lines: one, or two when the note only fits wrapped. */
  lines: string[]
  /** The datum. */
  from: { x: number; y: number }
  /** Where the leader meets the label. */
  to: { x: number; y: number }
  /** Position of the first line (start-anchored, vertically centered) and the label's box. */
  label: { x: number; y: number }
  box: Box
}

/** Label line box height for 11px text. */
export const NOTE_LINE = 14
const LINE = NOTE_LINE
const PAD = 2

/**
 * Space a chart adds above its plot when it carries notes, so a note on the highest datum (the
 * latest month at a new peak, say) always has room above it instead of being dropped.
 */
export const NOTE_HEADROOM = 28

function overlaps(a: Box, b: Box, pad = PAD): boolean {
  return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad
}

function inside(b: Box, area: Box): boolean {
  return b.x >= area.x && b.y >= area.y && b.x + b.w <= area.x + area.w && b.y + b.h <= area.y + area.h
}

/** Split a note into two lines at the space nearest its middle (null when it has no space). */
export function wrapNote(text: string): [string, string] | null {
  const mid = text.length / 2
  let best = -1
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i
  }
  return best > 0 ? [text.slice(0, best), text.slice(best + 1)] : null
}

interface Candidate {
  box: Box
  to: { x: number; y: number }
}

/**
 * Where a label of `w` x `h` px may go around datum `a`, nearest first: above (a short leader,
 * then longer ones; centered and slid sideways to stay inside), above and to the left (end-
 * anchored, for the last point of a series), right, left, then below.
 */
function around(a: { x: number; y: number }, w: number, h: number, area: Box): Candidate[] {
  const slide = (x: number) => Math.min(Math.max(x, area.x), area.x + area.w - w)
  const out: Candidate[] = []
  for (const lift of [12, 20, 36]) {
    const top = a.y - lift - h
    out.push({ box: { x: slide(a.x - w / 2), y: top, w, h }, to: { x: a.x, y: top + h } })
    out.push({ box: { x: slide(a.x - w + 6), y: top, w, h }, to: { x: a.x, y: top + h } })
  }
  out.push({ box: { x: a.x + 12, y: a.y - h / 2, w, h }, to: { x: a.x + 10, y: a.y } })
  out.push({ box: { x: a.x - 12 - w, y: a.y - h / 2, w, h }, to: { x: a.x - 10, y: a.y } })
  {
    const top = a.y + 20
    out.push({ box: { x: slide(a.x - w / 2), y: top, w, h }, to: { x: a.x, y: top } })
  }
  return out
}

/**
 * Place up to `MAX_NOTES` notes inside `area` (the plot plus the top margin, which charts with
 * notes grow by `NOTE_HEADROOM`), clear of `obstacles` (mark boxes and other labels, in the same
 * px) and of each other. Each note tries the places `around` its datum on one line, then on two
 * lines, then the top of the area above the datum with a longer leader. A note with no free place
 * is left out; the tooltip and table still carry the number.
 *
 * `measure` gives a line's width in px; by default it is scaled from the anchor's measured width.
 */
export function placeNotes(
  anchors: readonly NoteAnchor[],
  area: Box,
  obstacles: readonly Box[],
  measure?: (line: string) => number,
): PlacedNote[] {
  const placed: PlacedNote[] = []
  const taken: Box[] = [...obstacles]
  for (const a of anchors.slice(0, MAX_NOTES)) {
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !a.text) continue
    const widthOf = (line: string) =>
      Math.ceil(measure ? measure(line) : (a.width * line.length) / Math.max(1, a.text.length))
    const one = { lines: [a.text], w: Math.ceil(a.width), h: LINE }
    const split = wrapNote(a.text)
    const two = split ? { lines: split, w: Math.max(...split.map(widthOf)), h: 2 * LINE } : null
    const shapes = two ? [one, two] : [one]
    const free = (c: Candidate) => inside(c.box, area) && !taken.some((o) => overlaps(c.box, o))
    let fit: { c: Candidate; lines: string[] } | null = null
    for (const s of shapes) {
      const c = around(a, s.w, s.h, area).find(free)
      if (c) {
        fit = { c, lines: s.lines }
        break
      }
    }
    // Last resort: the top of the area (the reserved headroom), straight above the datum.
    if (!fit) {
      for (const s of shapes) {
        const x = Math.min(Math.max(a.x - s.w / 2, area.x), area.x + area.w - s.w)
        const c: Candidate = { box: { x, y: area.y, w: s.w, h: s.h }, to: { x: a.x, y: area.y + s.h } }
        if (c.box.y + c.box.h + PAD < a.y && free(c)) {
          fit = { c, lines: s.lines }
          break
        }
      }
    }
    if (!fit) continue
    const { box, to } = fit.c
    taken.push(box)
    placed.push({
      text: a.text,
      lines: fit.lines,
      from: { x: a.x, y: a.y },
      to,
      label: { x: box.x, y: box.y + LINE / 2 },
      box,
    })
  }
  return placed
}

/** Boxes around points (line vertices, dots), for use as obstacles. */
export function pointBoxes(points: readonly { x: number; y: number }[], r = 3): Box[] {
  return points
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .map((p) => ({ x: p.x - r, y: p.y - r, w: 2 * r, h: 2 * r }))
}

/**
 * Boxes along a polyline, so a label never sits across a line between two vertices: each segment
 * is sampled every `step` px.
 */
export function lineBoxes(points: readonly { x: number; y: number }[], step = 6, r = 2): Box[] {
  const out: Box[] = []
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue
    out.push({ x: p.x - r, y: p.y - r, w: 2 * r, h: 2 * r })
    const q = points[i + 1]
    if (!q || !Number.isFinite(q.x) || !Number.isFinite(q.y)) continue
    const n = Math.floor(Math.hypot(q.x - p.x, q.y - p.y) / step)
    for (let k = 1; k < n; k++) {
      const x = p.x + ((q.x - p.x) * k) / n
      const y = p.y + ((q.y - p.y) * k) / n
      out.push({ x: x - r, y: y - r, w: 2 * r, h: 2 * r })
    }
  }
  return out
}

/**
 * A finding's headline cut down to a chart note: the first clause (before a comparison such as
 * " from ", " vs " or " against ", or the first comma), with the chart's own subject taken off the
 * front and a ", mostly {where}" tail kept, so the chart says what the readout says in a few
 * words. Null when what is left is still longer than `max` characters (the note is then left out
 * rather than cut mid-thought).
 *
 *   shortNote('Offer acceptance fell to 68% in Q3 2026 from 80% in Q2 2026, mostly Bengaluru.', 'Offer acceptance')
 *   // 'Fell to 68% in Q3 2026, mostly Bengaluru'
 */
export function shortNote(title: string, subject?: string, max = 52): string | null {
  let t = title.trim().replace(/\.$/, '')
  const mostly = /, mostly ([^,]+)$/.exec(t)?.[0] ?? ''
  if (mostly) t = t.slice(0, -mostly.length)
  if (subject && t.toLowerCase().startsWith(`${subject.toLowerCase()} `)) t = t.slice(subject.length + 1)
  const cut = t.search(/ (from|vs|versus|against|compared with) |, /)
  if (cut > 0) t = t.slice(0, cut)
  const out = `${t.charAt(0).toUpperCase()}${t.slice(1)}${mostly}`
  return out.length <= max ? out : t.length <= max ? `${t.charAt(0).toUpperCase()}${t.slice(1)}` : null
}
