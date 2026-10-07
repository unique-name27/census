/**
 * Small custom Plot marks the kit shares: pixel-placed text labels (two-tone value + muted
 * secondary, status glyphs, halos), reference rules with labels, the pointer-driven hover band,
 * and annotations (`noteMark`, placement in `./notes`). Text fills are set as inline styles so they survive the house stylesheet and exports.
 */
import * as Plot from '@observablehq/plot'
import type { ChartTheme } from '../theme'
import { HOVER_CLASS } from './attrs'
import { maxTextWidth, textWidth, wrapText } from './measure'
import { type Box, NOTE_LINE, placeNotes } from './notes'

const SVG_NS = 'http://www.w3.org/2000/svg'

export { HOVER_CLASS }

type Attrs = Record<string, string | number | undefined | null>

export function svgEl<K extends keyof SVGElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Attrs = {},
): SVGElementTagNameMap[K] {
  const e = doc.createElementNS(SVG_NS, tag)
  // Plot puts text-anchor="middle" on its root svg, so custom text would inherit it and centre
  // on its x. Kit labels are placed by their left edge; anchor them there unless told otherwise.
  if (tag === 'text' && attrs['text-anchor'] == null) e.setAttribute('text-anchor', 'start')
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, String(v))
  return e
}

/** Pixel position of a value; band scales return the band center. */
export function scalePos(scales: Plot.ScaleFunctions, name: 'x' | 'y', v: unknown): number {
  const f = scales[name]
  if (!f) return Number.NaN
  const p = Number(f(v))
  return p + (scales.scales[name]?.bandwidth ?? 0) / 2
}

export function bandwidth(scales: Plot.ScaleFunctions, name: 'x' | 'y'): number {
  return scales.scales[name]?.bandwidth ?? 0
}

export type GlyphShape = 'circle' | 'diamond' | 'square' | 'triangle'

/** Status glyph shapes match the app's status icons: circle good, diamond warning, square serious, triangle critical. */
export function glyphForTone(tone: 'good' | 'warning' | 'serious' | 'critical'): GlyphShape {
  return tone === 'good'
    ? 'circle'
    : tone === 'warning'
      ? 'diamond'
      : tone === 'serious'
        ? 'square'
        : 'triangle'
}

export function glyphPath(shape: GlyphShape, cx: number, cy: number, size = 8): string {
  const r = size / 2
  switch (shape) {
    case 'circle':
      return `M${cx - r},${cy}a${r},${r} 0 1,0 ${size},0a${r},${r} 0 1,0 ${-size},0`
    case 'diamond':
      return `M${cx},${cy - r - 0.5}L${cx + r + 0.5},${cy}L${cx},${cy + r + 0.5}L${cx - r - 0.5},${cy}Z`
    case 'square':
      return `M${cx - r + 0.5},${cy - r + 0.5}h${size - 1}v${size - 1}h${-(size - 1)}Z`
    case 'triangle':
      return `M${cx},${cy - r - 0.5}L${cx + r + 0.5},${cy + r}L${cx - r - 0.5},${cy + r}Z`
  }
}

export interface TextPart {
  text: string
  color: string
  size?: number
  weight?: number
  /** Space before this part, in px (default 5 for parts after the first). */
  gap?: number
}

export interface PixelLabel {
  x: number
  y: number
  parts: TextPart[]
  anchor?: 'start' | 'middle' | 'end'
  /** Status glyph drawn before the text (start-anchored labels). */
  glyph?: { shape: GlyphShape; color: string }
  /** A sheet-colored outline behind the text, for labels that sit on gridlines or marks. */
  halo?: string
  /** Full text as an SVG <title>, for truncated labels. */
  title?: string
}

/** Line pitch of a wrapped category label, for 12px text. */
const WRAP_LEADING = 13

/**
 * Category labels beside a band axis: each on one line when it fits `maxWidth`, else broken onto
 * two lines in rows of 26px or more, so "Export control & trade compliance" reads whole where one
 * line would cut it to "Export control & trade com…". Returns each label's lines and the widest
 * line, for the margin.
 */
export function bandLabelLines(
  labels: readonly string[],
  maxWidth: number,
  pitch: number,
  size = 12,
): { lines: string[][]; width: number } {
  const lines = labels.map((l) => wrapText(l, maxWidth, size, 400, pitch >= 26 ? 2 : 1))
  return { lines, width: maxTextWidth(lines.flat(), size) }
}

/**
 * One category label's lines as pixel labels, end-anchored at x and centered on y; the full text
 * rides along as a title when the lines shorten it.
 */
export function bandLabel(
  label: string,
  lines: readonly string[],
  x: number,
  y: number,
  color: string,
  size = 12,
): PixelLabel[] {
  const cut = lines.join(' ') !== label
  return lines.map((text, i) => ({
    x,
    y: y + (i - (lines.length - 1) / 2) * WRAP_LEADING,
    anchor: 'end' as const,
    parts: [{ text, color, size }],
    title: cut ? label : undefined,
  }))
}

/** A mark that draws labels at pixel positions computed from the plot's scales and dimensions. */
export function labelsMark(
  layout: (scales: Plot.ScaleFunctions, dims: Plot.Dimensions) => PixelLabel[],
  ariaLabel = 'labels',
): Plot.RenderFunction {
  return (_index, scales, _values, dims, context) => {
    const doc = context.document
    const g = svgEl(doc, 'g', { 'aria-label': ariaLabel })
    for (const l of layout(scales, dims)) {
      if (!Number.isFinite(l.x) || !Number.isFinite(l.y) || !l.parts.length) continue
      let x = l.x
      if (l.glyph) {
        const gp = svgEl(doc, 'path', { d: glyphPath(l.glyph.shape, x + 4, l.y) })
        gp.style.fill = l.glyph.color
        g.append(gp)
        x += 12
      }
      const t = svgEl(doc, 'text', { x, y: l.y, dy: '0.32em', 'text-anchor': l.anchor ?? 'start' })
      if (l.halo) {
        t.style.stroke = l.halo
        t.style.strokeWidth = '3px'
        t.style.strokeLinejoin = 'round'
        t.style.paintOrder = 'stroke'
      }
      l.parts.forEach((p, i) => {
        // A part after the first starts with a space, so copied text and assistive tech read
        // "29 21 overdue" as two words; the gap is narrowed by the space's width to look the same.
        const space = i > 0 ? textWidth(' ', p.size ?? 11, p.weight ?? 400) : 0
        const span = svgEl(doc, 'tspan', { dx: i > 0 ? Math.max(0, (p.gap ?? 5) - space) : undefined })
        span.textContent = i > 0 ? ` ${p.text}` : p.text
        span.style.fill = p.color
        span.style.fontSize = `${p.size ?? 11}px`
        if (p.weight) span.style.fontWeight = String(p.weight)
        t.append(span)
      })
      if (l.title) {
        const title = svgEl(doc, 'title')
        title.textContent = l.title
        t.append(title)
      }
      g.append(t)
    }
    return g
  }
}

/**
 * Bars with a rounded data end and a square baseline, for either sign. Plot's bar marks apply
 * corner radii in screen space (ry1 is the top edge, rx2 the right edge), so positive and
 * negative values are drawn as two marks, each rounded on its data end.
 */
export function roundedBarsY<D>(
  data: readonly D[],
  value: (d: D) => number | null,
  options: Plot.BarYOptions,
  radius = 4,
): Plot.Markish[] {
  return [
    Plot.barY(
      data.filter((d) => (value(d) ?? 0) >= 0),
      { ...options, ry1: radius },
    ),
    Plot.barY(
      data.filter((d) => (value(d) ?? 0) < 0),
      { ...options, ry2: radius },
    ),
  ]
}

export function roundedBarsX<D>(
  data: readonly D[],
  value: (d: D) => number | null,
  options: Plot.BarXOptions,
  radius = 4,
): Plot.Markish[] {
  return [
    Plot.barX(
      data.filter((d) => (value(d) ?? 0) >= 0),
      { ...options, rx2: radius },
    ),
    Plot.barX(
      data.filter((d) => (value(d) ?? 0) < 0),
      { ...options, rx1: radius },
    ),
  ]
}

/** A reference value drawn as a rule with a label, e.g. "Company 12.4%" or "Target 1.00". */
export interface RefLine {
  value: number
  label: string
}

/**
 * Vertical (axis 'x') or horizontal (axis 'y') reference rule with its label. Vertical rules are
 * labeled above the plot. Horizontal rules are labeled above the line at the right end ('end'),
 * the left start ('start'), or in the right margin beside the line ('outside', which needs a
 * right margin of `refLabelWidth(ref)`), where it can never collide with marks; 'none' draws the
 * rule alone, for charts that place the label themselves. Push it after the marks it measures
 * against and before their value labels, so labels sit on top of the rule.
 */
export function refRule(
  ref: RefLine,
  axis: 'x' | 'y',
  t: ChartTheme,
  labelAt: 'start' | 'end' | 'outside' | 'none' = 'end',
): Plot.Markish[] {
  const rule =
    axis === 'x'
      ? Plot.ruleX([ref.value], { stroke: t.ink2, strokeWidth: 1 })
      : Plot.ruleY([ref.value], { stroke: t.ink2, strokeWidth: 1 })
  if (labelAt === 'none') return [rule]
  const label = labelsMark((scales, dims) => {
    const p = scalePos(scales, axis, ref.value)
    const part = { text: ref.label, color: t.ink2, size: 11, weight: 500 }
    if (axis === 'x') {
      const left = dims.marginLeft
      const right = dims.width - dims.marginRight
      const anchor = p - left < 40 ? 'start' : right - p < 40 ? 'end' : 'middle'
      return [{ x: p, y: dims.marginTop - 8, parts: [part], anchor, halo: t.sheet }]
    }
    if (labelAt === 'outside')
      return [{ x: dims.width - dims.marginRight + 6, y: p, parts: [part], anchor: 'start' }]
    return labelAt === 'end'
      ? [{ x: dims.width - dims.marginRight, y: p - 8, parts: [part], anchor: 'end', halo: t.sheet }]
      : [{ x: dims.marginLeft + 4, y: p - 8, parts: [part], anchor: 'start', halo: t.sheet }]
  }, 'reference label')
  return [rule, label]
}

/** Right margin that fits an 'outside' reference label. */
export function refLabelWidth(ref: RefLine): number {
  return Math.ceil(textWidth(ref.label, 11, 500)) + 12
}

/**
 * Hover band: a faint wash over the hovered row (axis 'y') or column (axis 'x'), driven by
 * Plot's pointer transform so the plot's `value` is the hovered datum. Rows extend into the
 * left margin so the category label is part of the highlight.
 */
export function hoverBand<D>(
  data: readonly D[],
  opts: { axis: 'x' | 'y'; value: (d: D) => unknown; color: string; opacity?: number; maxRadius?: number },
): Plot.Markish {
  const { axis, value, color, opacity = 0.05, maxRadius = 4000 } = opts
  const render: Plot.RenderFunction = (index, scales, values, dims, context) => {
    const g = svgEl(context.document, 'g', { class: HOVER_CLASS })
    const i = index[0]
    if (i === undefined) return g
    const bw = bandwidth(scales, axis)
    const pos = (values as Record<string, ArrayLike<number> | undefined>)[axis]?.[i]
    if (pos === undefined || !Number.isFinite(pos)) return g
    const r =
      axis === 'y'
        ? svgEl(context.document, 'rect', { x: 0, y: pos, width: dims.width, height: bw, rx: 3 })
        : svgEl(context.document, 'rect', {
            x: pos,
            y: dims.marginTop,
            width: bw,
            height: dims.height - dims.marginTop - dims.marginBottom,
            rx: 3,
          })
    r.style.fill = color
    r.style.fillOpacity = String(opacity)
    g.append(r)
    return g
  }
  return axis === 'y'
    ? Plot.tickY(data, Plot.pointerY({ y: (d: D) => value(d), maxRadius, render }))
    : Plot.tickX(data, Plot.pointerX({ x: (d: D) => value(d), maxRadius, render }))
}

/**
 * Annotations (docs/DESIGN-REFRESH.md 2.7): `resolve` turns the chart's notes into the pixels they
 * point at, with the boxes of the marks and labels they must stay clear of; `placeNotes` finds
 * free space near the datum (or drops a note; charts add `NOTE_HEADROOM` above the plot so a note
 * on the highest datum has room), and each placed note is drawn as a 1px ink-2
 * leader to an 11px ink-2 label on a sheet-colored halo. Push it after the marks and labels.
 *
 *   noteMark(t, (scales, dims) => ({
 *     anchors: notes.map((n) => ({ x: scalePos(scales, 'x', n.at), y: scalePos(scales, 'y', n.value), text: n.text })),
 *     obstacles: lineBoxes(points),
 *   }))
 */
export function noteMark(
  t: ChartTheme,
  resolve: (
    scales: Plot.ScaleFunctions,
    dims: Plot.Dimensions,
  ) => { anchors: { x: number; y: number; text: string }[]; obstacles?: Box[] },
): Plot.RenderFunction {
  return (_index, scales, _values, dims, context) => {
    const doc = context.document
    const g = svgEl(doc, 'g', { 'aria-label': 'annotations' })
    const { anchors, obstacles = [] } = resolve(scales, dims)
    if (!anchors.length) return g
    const area = {
      x: dims.marginLeft,
      y: 0,
      w: dims.width - dims.marginLeft - dims.marginRight,
      h: dims.height - dims.marginBottom,
    }
    const placed = placeNotes(
      anchors.map((a) => ({ ...a, width: textWidth(a.text, 11, 500) })),
      area,
      obstacles,
      (line) => textWidth(line, 11, 500),
    )
    for (const n of placed) {
      const leader = svgEl(doc, 'path', { d: `M${n.from.x},${n.from.y}L${n.to.x},${n.to.y}` })
      leader.style.stroke = t.ink2
      leader.style.strokeWidth = '1px'
      leader.style.fill = 'none'
      g.append(leader)
      const text = svgEl(doc, 'text', { x: n.label.x, y: n.label.y, dy: '0.32em', 'text-anchor': 'start' })
      n.lines.forEach((line, i) => {
        const span = svgEl(doc, 'tspan', i ? { x: n.label.x, dy: NOTE_LINE } : {})
        span.textContent = line
        text.append(span)
      })
      text.style.fill = t.ink2
      text.style.fontSize = '11px'
      text.style.fontWeight = '500'
      text.style.stroke = t.sheet
      text.style.strokeWidth = '3px'
      text.style.strokeLinejoin = 'round'
      text.style.paintOrder = 'stroke'
      g.append(text)
    }
    return g
  }
}
