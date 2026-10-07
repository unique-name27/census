/**
 * Pure layout and export rows for TrendGrid (small multiples, one cell per measure, each on its
 * own y scale). No DOM, unit-tested.
 */

import { formatMonthShort } from '@/lib/dates'
import type { Format } from '@/lib/format'
import type { Column } from '../types'

export interface TrendSeries {
  /** Stable id, usually the metric id ('hrbp.attrition.voluntary'). */
  id: string
  /** The measure name above the cell. */
  name: string
  /** Oldest first; the last value is the latest. Null breaks the line. */
  values: readonly (number | null)[]
  /**
   * The period of each value (ISO date or "YYYY-MM"), same length as `values`. Without it the
   * cell has no x axis and the table numbers the points.
   */
  periods?: readonly string[]
  target?: number | null
  /** How values and the target print. */
  format: Format
}

export interface TrendPoint {
  /** Index into the series' values. */
  i: number
  value: number
  /** Center in px from the top-left of the chart. */
  x: number
  y: number
}

export interface TrendCell {
  series: TrendSeries
  col: number
  row: number
  /** Cell box (header and plot) in px. */
  x: number
  y: number
  w: number
  /** Plot area of the cell. */
  plot: { x: number; y: number; w: number; h: number }
  points: TrendPoint[]
  /** Target rule's y in px, null without a target. */
  targetY: number | null
  /** The latest value (the last non-null one), and its index. */
  latest: { i: number; value: number } | null
}

export interface TrendGridLayout {
  cells: TrendCell[]
  columns: number
  height: number
}

export interface TrendGridOptions {
  /** Narrowest a cell may be (default 140; the design size is 160 x 96). */
  minCell?: number
  /** Force a column count (still at most the series count). */
  columns?: number
  gap?: number
  /** Header height above each plot: name and latest value (default 38). */
  header?: number
  /** Plot height (default 96). */
  plotHeight?: number
}

/**
 * Lay the cells out in reading order in a chart `width` px wide. Each cell's y scale runs over its
 * own values and target (padded 12%, so the line never touches the cell edges); a flat series
 * sits in the middle.
 */
export function trendGridLayout(
  series: readonly TrendSeries[],
  width: number,
  opts: TrendGridOptions = {},
): TrendGridLayout {
  const gap = opts.gap ?? 16
  const minCell = opts.minCell ?? 140
  const header = opts.header ?? 38
  const plotH = opts.plotHeight ?? 96
  const fit = Math.max(1, Math.floor((width + gap) / (minCell + gap)))
  const columns = Math.max(1, Math.min(series.length || 1, opts.columns ?? fit))
  const cellW = Math.max(40, (width - gap * (columns - 1)) / columns)
  const rowH = header + plotH + gap + 8
  const cells = series.map((s, k) => {
    const col = k % columns
    const row = Math.floor(k / columns)
    const x = col * (cellW + gap)
    const y = row * rowH
    const plot = { x: x + 4, y: y + header, w: cellW - 8, h: plotH }
    const vals = s.values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    const target = typeof s.target === 'number' && Number.isFinite(s.target) ? s.target : null
    const all = target == null ? vals : [...vals, target]
    let lo = all.length ? Math.min(...all) : 0
    let hi = all.length ? Math.max(...all) : 1
    if (hi === lo) {
      const pad = Math.abs(hi) * 0.1 || 1
      lo -= pad
      hi += pad
    }
    const pad = (hi - lo) * 0.12
    lo -= pad
    hi += pad
    const n = s.values.length
    const px = (i: number) => plot.x + (n <= 1 ? plot.w / 2 : (i / (n - 1)) * plot.w)
    const py = (v: number) => plot.y + plot.h - ((v - lo) / (hi - lo)) * plot.h
    const points: TrendPoint[] = []
    s.values.forEach((v, i) => {
      if (typeof v === 'number' && Number.isFinite(v)) points.push({ i, value: v, x: px(i), y: py(v) })
    })
    const last = points[points.length - 1]
    return {
      series: s,
      col,
      row,
      x,
      y,
      w: cellW,
      plot,
      points,
      targetY: target == null ? null : py(target),
      latest: last ? { i: last.i, value: last.value } : null,
    }
  })
  const rows = Math.ceil(series.length / columns)
  return { cells, columns, height: rows ? rows * rowH - gap : 0 }
}

/** A period key as a short label: "Sep '26" for dates and months, else as given. */
export function periodLabel(period: string | undefined, i: number): string {
  if (!period) return `Point ${i + 1}`
  if (/^\d{4}-\d{2}(-\d{2})?$/.test(period))
    return formatMonthShort(period.length === 7 ? `${period}-01` : period, true)
  return period
}

export interface TrendRow extends Record<string, unknown> {
  series: string
  metricId: string
  period: string
  value: number | null
  target: number | null
  format: Format
}

/** The long table a TrendGrid exports: one row per point (series, period, value, target). */
export function trendGridRows(series: readonly TrendSeries[]): TrendRow[] {
  return series.flatMap((s) =>
    s.values.map((v, i) => ({
      series: s.name,
      metricId: s.id,
      period: s.periods?.[i] ?? `Point ${i + 1}`,
      value: typeof v === 'number' && Number.isFinite(v) ? v : null,
      target: typeof s.target === 'number' && Number.isFinite(s.target) ? s.target : null,
      format: s.format,
    })),
  )
}

/** Columns for `trendGridRows`, with each value in its own measure's unit. */
export const TREND_GRID_COLUMNS: Column<TrendRow>[] = [
  { key: 'series', label: 'Measure' },
  { key: 'period', label: 'Period' },
  { key: 'value', label: 'Value', format: (r) => r.format },
  { key: 'target', label: 'Target', format: (r) => r.format },
]
