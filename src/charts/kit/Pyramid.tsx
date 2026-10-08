/**
 * Pyramid: one centered bar per row (the first row of `data` at the bottom), width proportional
 * to its value, with an optional outline per row (a past value, or a comparison's shape) drawn
 * on the same scale. Rows can be split into segments laid left to right inside the bar, 2px apart,
 * in fixed series order (categorical slots, or the ordinal ramp for ordered bands). The left
 * gutter holds the row labels and brackets over runs of rows (with a hairline between runs); the
 * right gutter holds aligned columns of numbers and up to two notes. Layout: `./pyramidModel`.
 *
 *   <Pyramid
 *     data={levels}                    // L1 first: L1 is drawn at the bottom
 *     id="level" label="label" shortLabel="level" value="today" outline="yearAgo"
 *     groups={[{ label: 'Individual contributor', keys: ['L1', …, 'L6'] }, …]}
 *     columns={[{ text: (d) => fmt(d.today), narrow: true, weight: 600 }, { text: (d) => fmtDelta(d.change, 'int'), muted: true, narrow: true }]}
 *     barLegend="Bar: today" outlineLegend="Outline: a year ago" outlineLabel="A year ago"
 *     onSelect={(d) => drill(d.drill)}
 *   />
 *
 * Hover washes the row and shows its tooltip (the segment under the pointer is named); a click
 * drills the row, or the segment under the pointer (`onSelectSegment`). The chart is one tab stop:
 * Up and Down move between rows, Left and Right through a split row's segments, Enter drills.
 * Below `PYRAMID_MIN_BARS` px of bars the gutters drop notes, then bracket labels and the
 * columns not marked `narrow`, and use `shortLabel`.
 */
import * as Plot from '@observablehq/plot'
import { type Format, fmt } from '@/lib/format'
import type { LegendSpec } from '../core/legend'
import { HOVER_CLASS, svgEl } from '../core/marks'
import { textWidth } from '../core/measure'
import { type ChartNote, MAX_NOTES } from '../core/notes'
import type { TipContent, TipRow } from '../core/tooltip'
import { housePlot, type PlotBuildContext, PlotChart, type PlotElement } from '../plot'
import { type ChartTheme, useChartTheme } from '../theme'
import {
  barPath,
  PYRAMID_BAR,
  PYRAMID_PITCH,
  type PyramidGroupIn,
  type PyramidRowBox,
  type PyramidSegmentIn,
  pyramidBrackets,
  pyramidGutters,
  pyramidKeyPoints,
  pyramidLayout,
  segmentAtX,
} from './pyramidModel'
import { otherLast, type SeriesColors, type SeriesScheme, seriesPalette } from './series'
import { type ChartBaseProps, type Key, numAt, orderedKeys, textAt } from './shared'

export type { PyramidGroupIn, PyramidSegmentIn } from './pyramidModel'

/** A column of the right gutter: one short text per row, right-aligned, tabular figures. */
export interface PyramidColumn<T> {
  text: (d: T) => string | null | undefined
  /** Muted ink (the first column is usually the row's own number, in ink). */
  muted?: boolean
  /** Kept when the chart is narrow. */
  narrow?: boolean
  /** Font weight (600 for the headline number). */
  weight?: number
}

export interface PyramidProps<T extends object> extends Omit<ChartBaseProps<T>, 'selectable'> {
  /** One datum per row, the bottom row first. */
  data: readonly T[]
  /** The row's key (for groups, notes and keyboard groups). */
  id: Key<T>
  /** The row label in the left gutter: "L3 Career". */
  label: Key<T>
  /** The label used when the chart is narrow: "L3" (default `label`). */
  shortLabel?: Key<T>
  /** The bar's value. */
  value: Key<T>
  /** The outline's value on the same scale (null for none in a row). */
  outline?: Key<T>
  /** The bar and outline values in the tooltip: "Today", "A year ago". */
  valueLabel?: string
  outlineLabel?: string
  /** Legend entries for the bar and the outline: "Bar: today", "Outline: a year ago". */
  barLegend?: string
  outlineLegend?: string
  /** Split each bar into segments (their values should add up to the row's value). */
  segments?: (d: T) => readonly PyramidSegmentIn[]
  /** Segment order, left to right and in the legend ("Other" segments always go last). */
  seriesOrder?: readonly string[]
  colors?: SeriesColors
  /** 'ordinal' maps `seriesOrder` onto the sequential ramp, for ordered bands (tenure). */
  scheme?: SeriesScheme
  /** Brackets over runs of rows by key, with a hairline between neighbouring runs. */
  groups?: readonly PyramidGroupIn[]
  /** Right-gutter columns, left to right. */
  columns?: readonly PyramidColumn<T>[]
  /** Up to two notes, each on its row (`at` is the row key or label), past the columns. */
  notes?: readonly ChartNote[]
  format?: Format
  /**
   * Tooltip rows after the value and outline: changes, shares and the hovered segment's count
   * (`segment` is its key, or null for the row).
   */
  tipRows?: (d: T, segment: string | null) => TipRow[]
  /** Click-to-drill on the segment under the pointer; without it such a click drills the row. */
  onSelectSegment?: (d: T, segment: string) => void
  /** Whether the row (segment null) or a segment opens records (pass the view's drill gate). */
  selectable?: (d: T, segment: string | null) => boolean
}

const HALO = 2

export function Pyramid<T extends object>({
  data,
  id,
  label,
  shortLabel,
  value,
  outline,
  valueLabel = 'Value',
  outlineLabel = 'Outline',
  barLegend,
  outlineLegend,
  segments,
  seriesOrder,
  colors: seriesColors,
  scheme,
  groups = [],
  columns = [],
  notes,
  format = 'int',
  tipRows,
  onSelect,
  onSelectSegment,
  selectable,
  lockedNote,
  ariaLabel,
}: PyramidProps<T>) {
  const split = !!segments
  const rowsIn = data.map((d) => ({
    key: textAt(d, id),
    value: numAt(d, value) ?? 0,
    outline: outline ? numAt(d, outline) : null,
    segments: segments ? segments(d) : [],
    datum: d,
  }))
  const names = split
    ? otherLast(
        orderedKeys(
          rowsIn.flatMap((r) => r.segments.filter((s) => s.value > 0).map((s) => s.key)),
          seriesOrder,
        ),
      )
    : []
  const hasOutline = rowsIn.some((r) => r.outline != null && r.outline > 0)
  const shownNotes = (notes ?? []).slice(0, MAX_NOTES)
  const noteText = (r: { key: string; datum: T }) =>
    shownNotes.find((n) => String(n.at) === r.key || String(n.at) === textAt(r.datum, label))?.text ?? null

  const theme = useChartTheme()
  const paletteFor = (t: ChartTheme) =>
    split ? seriesPalette(t, names, { colors: seriesColors, scheme, order: seriesOrder }) : [t.series[0]]
  const colorOf = (t: ChartTheme, key: string) => {
    const p = paletteFor(t)
    return split ? (p[names.indexOf(key)] ?? t.deemph) : p[0]
  }
  const palette = paletteFor(theme)
  const legendItems: Extract<LegendSpec, { kind: 'swatch' }>['items'] = [
    ...(split
      ? names.map((n, i) => ({ label: n, color: palette[i], shape: 'rect' as const }))
      : barLegend
        ? [{ label: barLegend, color: theme.series[0], shape: 'rect' as const }]
        : []),
    ...(hasOutline && outlineLegend
      ? [{ label: outlineLegend, color: theme.ink2, shape: 'outline' as const }]
      : []),
  ]
  const legend: LegendSpec | null = legendItems.length ? { kind: 'swatch', items: legendItems } : null

  /** Gutters and rows for a width: the same layout for drawing, hit-testing and the keyboard. */
  const present = groups.filter((g) => g.keys.some((k) => rowsIn.some((r) => r.key === k)))
  const layoutAt = (width: number) => {
    // Gutter texts in layout order (top row first), so column widths fit every row.
    const top = [...rowsIn].reverse()
    const gutters = pyramidGutters({
      width,
      labels: top.map((r) => textAt(r.datum, label)),
      shortLabels: top.map((r) => textAt(r.datum, shortLabel ?? label)),
      bracketLabels: present.map((g) => g.label),
      columns: columns.map((c) => ({
        texts: top.map((r) => c.text(r.datum) ?? null),
        narrow: !!c.narrow,
        weight: c.weight,
      })),
      notes: top.map(noteText).filter((n): n is string => !!n),
      measure: textWidth,
    })
    const layout = pyramidLayout(rowsIn, { width, left: gutters.left, right: gutters.right })
    return { gutters, layout }
  }
  const height = pyramidLayout(rowsIn, { width: 400, left: 0, right: 0 }).height

  const build = ({ width, theme: t }: PlotBuildContext) => {
    if (!rowsIn.length) return null
    const { gutters: g, layout } = layoutAt(width)
    const { brackets, dividers } = pyramidBrackets(layout, present)
    const draw: Plot.RenderFunction = (_i, _s, _v, _d, context) => {
      const doc = context.document
      const root = svgEl(doc, 'g', { 'aria-label': 'pyramid' })
      const line = (x1: number, y1: number, x2: number, y2: number, stroke: string) => {
        const l = svgEl(doc, 'line', { x1, y1, x2, y2 })
        l.style.stroke = stroke
        l.style.strokeWidth = '1px'
        root.append(l)
      }
      const text = (
        x: number,
        y: number,
        content: string,
        o: { anchor?: 'start' | 'end'; size?: number; weight?: number; color: string; tnum?: boolean },
      ) => {
        const el = svgEl(doc, 'text', { x, y, dy: '0.32em', 'text-anchor': o.anchor ?? 'start' })
        el.textContent = content
        el.style.fill = o.color
        el.style.fontSize = `${o.size ?? 12}px`
        if (o.weight) el.style.fontWeight = String(o.weight)
        if (o.tnum) el.style.fontVariantNumeric = 'tabular-nums'
        root.append(el)
      }
      // Hairlines between runs of rows, under everything else.
      for (const y of dividers) line(g.bracket, y, width, y, t.rule)
      // The axis the bars are centered on.
      const firstRow = layout.rows[0]
      const lastRow = layout.rows[layout.rows.length - 1]
      if (firstRow && lastRow) line(layout.cx, firstRow.y - 2, layout.cx, lastRow.y + PYRAMID_BAR + 2, t.axis)
      // Brackets: a vertical rule with short ticks at both ends, the label to its left.
      if (g.bracket > 0)
        for (const b of brackets) {
          const bx = g.bracket - 6
          const p = svgEl(doc, 'path', { d: `M${bx + 4},${b.y0}H${bx}V${b.y1}H${bx + 4}` })
          p.style.fill = 'none'
          p.style.stroke = t.axis
          p.style.strokeWidth = '1px'
          root.append(p)
          const lines = g.bracketLines[present.findIndex((gr) => gr.label === b.label)] ?? [b.label]
          const mid = (b.y0 + b.y1) / 2
          for (const [k, ln] of lines.entries())
            text(bx - 6, mid + (k - (lines.length - 1) / 2) * 13, ln, {
              anchor: 'end',
              size: 11,
              color: t.ink2,
            })
        }
      for (const r of layout.rows) {
        text(g.left - 10, r.cy, textAt(r.datum, g.compact ? (shortLabel ?? label) : label), {
          anchor: 'end',
          color: t.ink2,
        })
        for (const s of r.segments) {
          const seg = svgEl(doc, 'path', { d: barPath(s.x0, s.x1, r.y, PYRAMID_BAR, s.first, s.last) })
          seg.style.fill = split ? colorOf(t, s.key) : t.series[0]
          root.append(seg)
        }
      }
      // Outlines over the bars, each on a sheet halo so it reads over the fill.
      for (const r of layout.rows) {
        if (!r.ring) continue
        for (const [stroke, w] of [
          [t.sheet, 1.5 + 2 * HALO],
          [t.ink2, 1.5],
        ] as const) {
          const o = svgEl(doc, 'rect', {
            x: r.ring.x0,
            y: r.ring.y0,
            width: r.ring.x1 - r.ring.x0,
            height: r.ring.y1 - r.ring.y0,
            rx: 4,
          })
          o.style.fill = 'none'
          o.style.stroke = stroke
          o.style.strokeWidth = `${w}px`
          root.append(o)
        }
      }
      // Right gutter: aligned columns, then the notes.
      for (const r of layout.rows) {
        columns.forEach((c, i) => {
          if (!g.columns[i]) return
          const s = c.text(r.datum)
          if (!s) return
          text(layout.x1 + g.columnEnds[i], r.cy, s, {
            anchor: 'end',
            color: c.muted ? t.ink2 : t.ink,
            weight: c.weight,
            tnum: true,
          })
        })
        const note = g.notes > 0 ? noteText(r) : null
        if (note)
          text(layout.x1 + (g.columnEnds[g.columnEnds.length - 1] ?? 0) + 14, r.cy, note, {
            size: 11,
            weight: 500,
            color: t.ink2,
          })
      }
      return root
    }
    const hover: Plot.RenderFunction = (index, _s, _v, _d, context) => {
      const gEl = svgEl(context.document, 'g', { class: HOVER_CLASS })
      const i = index[0]
      if (i === undefined) return gEl
      const r = layout.rows[i]
      const wash = svgEl(context.document, 'rect', {
        x: 0,
        y: r.y - 3,
        width,
        height: PYRAMID_BAR + 6,
        rx: 3,
      })
      wash.style.fill = t.ink
      wash.style.fillOpacity = '0.05'
      gEl.append(wash)
      return gEl
    }
    const node = housePlot(
      { width, theme: t },
      {
        width,
        height: layout.height,
        margin: 0,
        x: { type: 'identity', axis: null },
        y: { type: 'identity', axis: null },
        marks: [
          draw,
          Plot.ruleY(
            layout.rows,
            Plot.pointerY({
              y: (r: PyramidRowBox<T>) => r.cy,
              maxRadius: PYRAMID_PITCH / 2 + 1,
              render: hover,
            }),
          ),
        ],
      },
    )
    node.setAttribute('data-chart', '')
    return node
  }

  const widthOf = (plot: PlotElement) => {
    const svg = plot instanceof SVGSVGElement ? plot : plot.querySelector('svg')
    return Number(svg?.getAttribute('width')) || 0
  }
  const segmentOf = (r: PyramidRowBox<T>, part: string | null) =>
    part == null ? undefined : r.segments.find((s) => s.key === part)
  const canOpen = (r: PyramidRowBox<T>, part: string | null): boolean => {
    if (!onSelect && !(part != null && onSelectSegment)) return false
    const has = part == null ? r.value > 0 : (segmentOf(r, part)?.value ?? 0) > 0
    return has && (selectable?.(r.datum, part) ?? true)
  }
  const tip = (r: PyramidRowBox<T>, part: string | null): TipContent => {
    const rows: TipRow[] = [
      { value: fmt(r.value, format), label: valueLabel, strong: part == null },
      ...(outline && r.outline != null ? [{ value: fmt(r.outline, format), label: outlineLabel }] : []),
      ...(tipRows?.(r.datum, part) ?? []),
    ]
    const locked = !canOpen(r, part) && (onSelect || onSelectSegment) ? lockedNote?.(r.datum) : null
    return { title: textAt(r.datum, label), rows, ...(locked ? { note: locked } : {}) }
  }

  return (
    <PlotChart<PyramidRowBox<T>>
      build={build}
      height={height}
      legend={legend}
      tip={tip}
      pick={split ? (r, at) => segmentAtX(r, at.x)?.key ?? null : undefined}
      keyPoints={(plot) => pyramidKeyPoints(layoutAt(widthOf(plot)).layout, split)}
      selectable={canOpen}
      onSelect={
        onSelect || onSelectSegment
          ? (r, part) => {
              if (part != null && onSelectSegment) onSelectSegment(r.datum, part)
              else onSelect?.(r.datum)
            }
          : undefined
      }
      ariaLabel={
        ariaLabel ??
        `Pyramid, top row first: ${[...rowsIn]
          .reverse()
          .map((r) => `${textAt(r.datum, label)} ${fmt(r.value, format)}`)
          .join(', ')}`
      }
    />
  )
}
