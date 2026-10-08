/**
 * BulletList: one row per measure, each on its own scale, for "how far is each measure from its
 * target" (the HR home's measures against target, the developer home's freshness against limit).
 *
 * Each row: the measure name on the left; a 6px --sheet-3 track from 0 to 1.15 x max(value,
 * target); an 8px --s1 bar for the value with a 4px rounded end; a 2px x 16px ink tick at the
 * target; then the value (13px, 600) and the status glyph with its word ("Met", "Missed"). Rows
 * can sit under group headers (a practice). Units differ by row, so `format` is a function of the
 * row. Tooltip, click-to-drill and the keyboard layer come from PlotChart; the chart exports as
 * one SVG (`data-chart`).
 *
 *   <Figure id="scorecard-measures" title="Measures against target" data={rows} columns={cols} metric="scorecard.measures.status">
 *     <BulletList
 *       data={rows}
 *       label="measure"
 *       value="value"
 *       target="target"
 *       group="practice"
 *       format={(r, v) => fmt(v, r.format)}
 *       status={(r) => ({ tone: r.status === 'met' ? 'good' : r.status === 'watch' ? 'warning' : 'critical', label: STATUS_WORD[r.status] })}
 *       onSelect={(r) => drill(r.kpi.drill)}
 *       onSelectLabel={(r) => goTo(r.opens.view, r.opens.tab)}
 *     />
 *   </Figure>
 *
 * A row without a value shows "—" and no bar; one without a target shows no tick.
 */
import * as Plot from '@observablehq/plot'
import { DASH } from '@/lib/format'
import { toneColor } from '../core/color'
import type { KeyPoint } from '../core/keyboard'
import {
  bandLabel,
  bandLabelLines,
  glyphForTone,
  glyphPath,
  HOVER_CLASS,
  labelsMark,
  svgEl,
} from '../core/marks'
import { maxTextWidth, textWidth } from '../core/measure'
import type { TipContent, TipRow } from '../core/tooltip'
import { housePlot, type PlotBuildContext, PlotChart, type PlotElement, type PlotPointer } from '../plot'
import { type BulletRow, type BulletStatus, bulletLayout } from './bulletModel'
import { type ChartBaseProps, gateOf, HIDDEN_NOTE, type Key, numAt, textAt } from './shared'

export type { BulletStatus } from './bulletModel'

type Num<T> = Key<T> | ((d: T) => number | null)
type Text<T> = Key<T> | ((d: T) => string | null)

export interface BulletListProps<T extends object> extends ChartBaseProps<T> {
  data: readonly T[]
  label: Text<T>
  value: Num<T>
  target: Num<T>
  /** The printed value (and target) of a row, in that row's unit: `(r, v) => fmt(v, r.format)`. */
  format: (d: T, v: number | null) => string
  /** The row's state: the glyph shape and color, and its word. */
  status?: (d: T) => BulletStatus | null
  /** Row group (a practice): a header line each time it changes; keep a group's rows together. */
  group?: Text<T>
  /** Click on the measure name (e.g. open its practice tab); the bar and value call `onSelect`. */
  onSelectLabel?: (d: T) => void
  /** Row pitch in px (default 28). */
  rowHeight?: number
  /** Tooltip note for rows without a value (default: hidden for anonymity). */
  nullNote?: string
  /**
   * 'row' (default): each row on its own scale. 'shared': one scale for every row, for measures in
   * one unit (ratios of heads), so bar lengths compare across rows.
   */
  scale?: 'row' | 'shared'
}

const TRACK = 6
const BAR = 8
const TICK_H = 16
const GLYPH_W = 12

const num =
  <T extends object>(a: Num<T>) =>
  (d: T) =>
    typeof a === 'function' ? a(d) : numAt(d, a)
const text =
  <T extends object>(a: Text<T>) =>
  (d: T) =>
    typeof a === 'function' ? (a(d) ?? '') : textAt(d, a)

export function BulletList<T extends object>({
  data,
  label,
  value,
  target,
  format,
  status,
  group,
  onSelect,
  onSelectLabel,
  selectable,
  lockedNote,
  rowHeight = 28,
  nullNote = HIDDEN_NOTE,
  scale = 'row',
  ariaLabel,
}: BulletListProps<T>) {
  const layout = bulletLayout(
    data,
    {
      label: text(label),
      value: num(value),
      target: num(target),
      status,
      group: group ? (d) => text(group)(d) || null : undefined,
    },
    { rowHeight, scale },
  )
  const { rows, groups, height } = layout
  const valueText = (r: BulletRow<T>) => (r.value == null ? DASH : format(r.datum, r.value))
  const statusTone = (s: BulletStatus | null) => (s && s.tone !== 'none' ? s.tone : null)

  // Geometry shared by the build, the pointer pick and the keyboard.
  const geom = (width: number) => {
    const labelMax = Math.max(80, width * 0.34)
    // A measure name that would be cut breaks onto two lines instead.
    const band = bandLabelLines(
      rows.map((r) => r.label),
      labelMax,
      rowHeight,
    )
    const shown = band.lines
    const labelW = Math.ceil(
      Math.max(
        band.width,
        maxTextWidth(
          groups.map((g) => g.label),
          12,
          500,
        ),
      ),
    )
    const left = Math.min(labelW, labelMax) + 14
    const tail = Math.ceil(
      Math.max(
        0,
        ...rows.map(
          (r) =>
            textWidth(valueText(r), 13, 600) +
            (r.status ? 6 + GLYPH_W + textWidth(r.status.label, 11, 500) : 0),
        ),
      ),
    )
    const right = Math.min(tail + 12, width * 0.4)
    const trackW = Math.max(24, width - left - right)
    return { shown, left, trackW, tailX: left + trackW + 10 }
  }

  const build = ({ width, theme: t }: PlotBuildContext) => {
    if (!rows.length) return null
    const g = geom(width)
    const at = (share: number) => g.left + share * g.trackW
    const mid = (r: BulletRow<T>) => r.y + rowHeight / 2
    const draw: Plot.RenderFunction = (_i, _s, _v, _d, context) => {
      const doc = context.document
      const root = svgEl(doc, 'g', { 'aria-label': 'bullets' })
      for (const r of rows) {
        const cy = mid(r)
        const track = svgEl(doc, 'rect', {
          x: g.left,
          y: cy - TRACK / 2,
          width: g.trackW,
          height: TRACK,
          rx: TRACK / 2,
        })
        track.style.fill = t.sheet3
        root.append(track)
        if (r.valueAt != null && r.valueAt > 0) {
          const w = Math.max(2, r.valueAt * g.trackW)
          const rad = Math.min(4, w / 2)
          const x0 = g.left
          const y0 = cy - BAR / 2
          // Square start, 4px rounded data end.
          const bar = svgEl(doc, 'path', {
            d: `M${x0},${y0}h${w - rad}a${rad},${rad} 0 0 1 ${rad},${rad}v${BAR - 2 * rad}a${rad},${rad} 0 0 1 ${-rad},${rad}h${-(w - rad)}Z`,
          })
          bar.style.fill = t.series[0]
          root.append(bar)
        }
        if (r.targetAt != null) {
          const tick = svgEl(doc, 'rect', {
            x: at(r.targetAt) - 1,
            y: cy - TICK_H / 2,
            width: 2,
            height: TICK_H,
          })
          tick.style.fill = t.ink
          root.append(tick)
        }
      }
      return root
    }
    const hover: Plot.RenderFunction = (index, _s, _v, dims, context) => {
      const gEl = svgEl(context.document, 'g', { class: HOVER_CLASS })
      const i = index[0]
      if (i === undefined) return gEl
      const r = rows[i]
      const rect = svgEl(context.document, 'rect', {
        x: 0,
        y: r.y,
        width: dims.width,
        height: rowHeight,
        rx: 3,
      })
      rect.style.fill = t.ink
      rect.style.fillOpacity = '0.05'
      gEl.append(rect)
      return gEl
    }
    return housePlot(
      { width, theme: t },
      {
        width,
        height,
        margin: 0,
        x: { type: 'identity', axis: null },
        y: { type: 'identity', axis: null },
        marks: [
          Plot.ruleY(
            rows,
            Plot.pointerY({ y: (r: BulletRow<T>) => mid(r), maxRadius: rowHeight, render: hover }),
          ),
          draw,
          labelsMark(
            () => [
              ...groups.map((gr) => ({
                x: 0,
                y: gr.y + rowHeight / 2 + 2,
                parts: [{ text: gr.label, color: t.ink, size: 12, weight: 600 }],
              })),
              ...rows.flatMap((r, i) => bandLabel(r.label, g.shown[i], g.left - 12, mid(r), t.ink2)),
            ],
            'measure names',
          ),
          labelsMark(
            () =>
              rows.map((r) => {
                const tone = statusTone(r.status)
                return {
                  x: g.tailX,
                  y: mid(r),
                  parts: [
                    { text: valueText(r), color: r.value == null ? t.muted : t.ink, size: 13, weight: 600 },
                    ...(r.status
                      ? [{ text: r.status.label, color: t.ink2, size: 11, weight: 500, gap: tone ? 20 : 8 }]
                      : []),
                  ],
                }
              }),
            'values',
          ),
          // The status glyph sits between the value and its word.
          (_i, _s, _v, _d, context) => {
            const gEl = svgEl(context.document, 'g', { 'aria-label': 'status glyphs' })
            for (const r of rows) {
              const tone = statusTone(r.status)
              if (!tone) continue
              const x = g.tailX + textWidth(valueText(r), 13, 600) + 6
              const p = svgEl(context.document, 'path', { d: glyphPath(glyphForTone(tone), x + 4, mid(r)) })
              p.style.fill = toneColor(t, tone)
              gEl.append(p)
            }
            return gEl
          },
        ],
      },
    )
  }

  const open = gateOf<T>(() => true, selectable)
  const canDrill = (r: BulletRow<T>, part: string | null) =>
    part === 'label' ? !!onSelectLabel : !!onSelect && r.value != null && open(r.datum)
  const tip = (r: BulletRow<T>, part: string | null): TipContent => {
    const out: TipRow[] = [{ value: valueText(r), label: 'Value' }]
    if (r.target != null) out.push({ value: format(r.datum, r.target), label: 'Target' })
    if (r.status) out.push({ value: r.status.label, label: 'Status', strong: false })
    return {
      title: r.group ? `${r.group} · ${r.label}` : r.label,
      rows: out,
      note:
        part === 'label' && onSelectLabel
          ? 'Click to open the measure'
          : r.value == null
            ? nullNote
            : onSelect && !open(r.datum)
              ? (lockedNote?.(r.datum) ?? undefined)
              : undefined,
    }
  }
  /** The measure name is its own click target when `onSelectLabel` is given. */
  const pick = (_r: BulletRow<T>, at: PlotPointer, plot: PlotElement): string | null =>
    onSelectLabel && at.x < geom(plotWidth(plot)).left - 4 ? 'label' : null
  const keyPoints = (plot: PlotElement): KeyPoint<BulletRow<T>>[] => {
    const g = geom(plotWidth(plot))
    return rows.map((r) => ({
      datum: r,
      x: g.left + g.trackW / 2,
      y: r.y + rowHeight / 2,
      w: g.trackW + 8,
      h: TICK_H + 2,
    }))
  }

  return (
    <PlotChart<BulletRow<T>>
      build={(c) => {
        const node = build(c)
        node?.setAttribute('data-chart', '')
        return node
      }}
      height={height}
      tip={tip}
      pick={onSelectLabel ? pick : undefined}
      keyPoints={keyPoints}
      selectable={canDrill}
      onSelect={
        onSelect || onSelectLabel
          ? (r, part) => {
              if (part === 'label') onSelectLabel?.(r.datum)
              else onSelect?.(r.datum)
            }
          : undefined
      }
      ariaLabel={ariaLabel}
    />
  )
}

/** The width a plot was drawn at (its SVG width attribute). */
function plotWidth(plot: PlotElement): number {
  const svg = plot instanceof SVGSVGElement ? plot : plot.querySelector('svg')
  return Number(svg?.getAttribute('width')) || 0
}
