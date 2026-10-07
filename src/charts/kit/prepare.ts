/**
 * Pure data shaping for the chart kit (no DOM): ranking and folding, category x series grids,
 * stacking, time parsing, binning and deterministic jitter. Unit-tested.
 */
import { bin as d3bin } from 'd3'
import { formatMonthShort } from '@/lib/dates'
import { fnv } from '@/lib/stats'
import type { Tone } from '../core/color'
import { numAt, orderedKeys, textAt } from './shared'

/* ───────── BarList ───────── */

export interface BarRow<T> {
  /** Unique band key (index based, so duplicate labels stay separate rows). */
  key: string
  label: string
  value: number | null
  secondary: string
  tone: Tone
  /** Status shown as a glyph beside the value without recoloring the bar (from `glyphTone`). */
  glyph?: Tone
  /** The source row; null for the folded "Other" row. */
  datum: T | null
  /** Number of rows folded into this one (0 for ordinary rows). */
  folded: number
  /** The source rows folded into the "Other" row (absent on ordinary rows). */
  foldedRows?: T[]
  /** Printed value from the chart's `valueText` (absent when not given or the value is missing). */
  text?: string
}

export type FoldRule<T> = 'sum' | 'mean' | ((rest: T[]) => number | null)

export function barListRows<T extends object>(
  data: readonly T[],
  opts: {
    label: string
    value: string
    sort?: 'desc' | 'asc' | 'none'
    top?: number
    other?: FoldRule<T>
    secondary?: string | ((d: T) => string | null | undefined)
    tone?: (d: T) => Tone
    glyphTone?: (d: T) => Tone
    /** Printed value for a row with a value (e.g. signed "+0.8%"); missing values stay "—". */
    valueText?: (d: T) => string
  },
): BarRow<T>[] {
  const { sort = 'desc', top, other = 'sum' } = opts
  const base = data.map((d) => ({ d, v: numAt(d, opts.value) }))
  if (sort !== 'none') {
    const dir = sort === 'desc' ? -1 : 1
    base.sort((a, b) => {
      if (a.v == null) return b.v == null ? 0 : 1
      if (b.v == null) return -1
      return (a.v - b.v) * dir
    })
  }
  const secondaryOf = (d: T): string => {
    if (!opts.secondary) return ''
    if (typeof opts.secondary === 'function') return opts.secondary(d) ?? ''
    return textAt(d, opts.secondary)
  }
  const rowOf = ({ d, v }: { d: T; v: number | null }, i: number): BarRow<T> => ({
    key: `r${i}`,
    label: textAt(d, opts.label),
    value: v,
    secondary: secondaryOf(d),
    tone: opts.tone?.(d) ?? 'default',
    ...(opts.glyphTone ? { glyph: opts.glyphTone(d) } : {}),
    ...(opts.valueText && v != null ? { text: opts.valueText(d) } : {}),
    datum: d,
    folded: 0,
  })
  // Folding a single row into "Other (1)" hides a name for nothing; keep it.
  if (top === undefined || base.length <= top + 1) return base.map(rowOf)
  const kept = base.slice(0, top).map(rowOf)
  const rest = base.slice(top).map((b) => b.d)
  const restVals = base
    .slice(top)
    .map((b) => b.v)
    .filter((v): v is number => v != null)
  let value: number | null
  if (typeof other === 'function') value = other(rest)
  else if (!restVals.length) value = null
  else if (other === 'mean') value = restVals.reduce((a, b) => a + b, 0) / restVals.length
  else value = restVals.reduce((a, b) => a + b, 0)
  return [
    ...kept,
    {
      key: 'other',
      label: `Other (${rest.length})`,
      value,
      secondary: '',
      tone: 'deemph',
      datum: null,
      folded: rest.length,
      foldedRows: rest,
    },
  ]
}

/* ───────── Categories x series (Columns, HBars) ───────── */

export interface CategoryCell<T> {
  series: string
  value: number | null
  datum: T
}

export interface Category<T> {
  key: string
  label: string
  cells: CategoryCell<T>[]
  /** Sum of the non-null values; null when every value is missing (hidden), so it prints "—". */
  total: number | null
}

export interface CategoryModel<T> {
  categories: Category<T>[]
  series: string[]
}

/** Month key "2026-09" for an ISO date or month value. */
export const monthOf = (v: string): string => v.slice(0, 7)

export function categoryModel<T extends object>(
  data: readonly T[],
  opts: {
    cat: string
    value: string
    series?: string
    catOrder?: readonly string[]
    seriesOrder?: readonly string[]
    month?: boolean
  },
): CategoryModel<T> {
  const catOf = (d: T) => (opts.month ? monthOf(textAt(d, opts.cat)) : textAt(d, opts.cat))
  const seriesOf = (d: T) => (opts.series ? textAt(d, opts.series) : '')
  const catKeys = opts.month
    ? orderedKeys(data.map(catOf)).sort()
    : orderedKeys(data.map(catOf), opts.catOrder)
  const series = opts.series ? orderedKeys(data.map(seriesOf), opts.seriesOrder) : ['']
  const byCat = new Map<string, Category<T>>(
    catKeys.map((k) => [k, { key: k, label: k, cells: [], total: null }]),
  )
  for (const d of data) {
    const c = byCat.get(catOf(d))
    if (!c) continue
    const v = numAt(d, opts.value)
    c.cells.push({ series: seriesOf(d), value: v, datum: d })
    if (v != null) c.total = (c.total ?? 0) + v
  }
  const rank = new Map(series.map((s, i) => [s, i]))
  for (const c of byCat.values())
    c.cells.sort((a, b) => (rank.get(a.series) ?? 0) - (rank.get(b.series) ?? 0))
  return { categories: [...byCat.values()], series }
}

export interface StackSegment<T> {
  cat: string
  series: string
  seriesIndex: number
  value: number
  /** Share of the category total (0-1). */
  share: number
  lo: number
  hi: number
  /** Outermost segment of its stack: gets the rounded data end. */
  top: boolean
  datum: T
}

/** Stack positive values in series order; `normalize` stacks shares of the category total. */
export function stackSegments<T>(model: CategoryModel<T>, normalize = false): StackSegment<T>[] {
  const out: StackSegment<T>[] = []
  const rank = new Map(model.series.map((s, i) => [s, i]))
  for (const c of model.categories) {
    let acc = 0
    const total = c.total ?? 0
    const segs: StackSegment<T>[] = []
    for (const cell of c.cells) {
      if (cell.value == null || cell.value <= 0) continue
      const v = normalize ? (total > 0 ? cell.value / total : 0) : cell.value
      segs.push({
        cat: c.key,
        series: cell.series,
        seriesIndex: rank.get(cell.series) ?? 0,
        value: cell.value,
        share: total > 0 ? cell.value / total : 0,
        lo: acc,
        hi: acc + v,
        top: false,
        datum: cell.datum,
      })
      acc += v
    }
    if (segs.length) segs[segs.length - 1].top = true
    out.push(...segs)
  }
  return out
}

/* ───────── Time ───────── */

/** Date (UTC) for "YYYY-MM", "YYYY-MM-DD" or a date-time; null when unparseable. */
export function parseTime(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  if (typeof v !== 'string') return null
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(v)
  if (!m) return null
  const t = Date.UTC(+m[1], +m[2] - 1, m[3] ? +m[3] : 1)
  return Number.isFinite(t) ? new Date(t) : null
}

/** Calendar quarter of a UTC time as a short tick label: "Q3 '26". */
export function quarterLabel(t: number): string {
  const d = new Date(t)
  return `Q${Math.floor(d.getUTCMonth() / 3) + 1} '${String(d.getUTCFullYear()).slice(2)}`
}

export interface TimeTick {
  t: number
  label: string
}

/**
 * Explicit ticks for a time axis, placed on data dates: one per month ("Sep", with the year on
 * the first tick and on January: "Jan '26"), or one per quarter at its quarter-end month
 * ("Q3 '26"; quarterly data that isn't on quarter ends gets one tick per point). Ticks are thinned
 * to every k-th, counted back from the latest, so labels `measure`d in px stay apart over
 * `width` px. Pure; `measure` is the text-width function.
 */
/**
 * Thinned axis ticks that still show at least three labels (start, middle, end) when the axis has
 * three or more positions, so a phone never shows one lonely "Jan '26" (docs/DESIGN-REFRESH.md 2.7).
 */
export function minThreeTicks<K>(all: readonly K[], kept: readonly K[]): K[] {
  if (kept.length >= 3 || all.length < 3) return [...kept]
  return [all[0], all[Math.floor((all.length - 1) / 2)], all[all.length - 1]]
}

/**
 * Whether the i-th of a run of month ticks carries its year: the first does, and any whose year
 * differs from the tick before ("Oct '24, Sep '25, Sep '26"), so two ticks never read the same.
 */
export function tickHasYear(ticks: readonly (number | Date)[], i: number): boolean {
  if (i <= 0) return true
  const year = (t: number | Date) => new Date(t).getUTCFullYear()
  return year(ticks[i]) !== year(ticks[i - 1])
}

export function timeTicks(
  times: readonly number[],
  unit: 'month' | 'quarter',
  width: number,
  measure: (label: string) => number,
): TimeTick[] {
  const sorted = [...new Set(times.filter(Number.isFinite))].sort((a, b) => a - b)
  if (!sorted.length) return []
  const groups = new Map<string, number[]>()
  for (const t of sorted) {
    const d = new Date(t)
    const y = d.getUTCFullYear()
    const m = d.getUTCMonth()
    const k = unit === 'month' ? `${y}-${m}` : `${y}-Q${Math.floor(m / 3)}`
    const g = groups.get(k)
    if (g) g.push(t)
    else groups.set(k, [t])
  }
  const picks: number[] = []
  for (const g of groups.values()) {
    if (unit === 'month') {
      picks.push(g[0])
      continue
    }
    const ends = g.filter((t) => new Date(t).getUTCMonth() % 3 === 2)
    if (ends.length) picks.push(ends[ends.length - 1])
    // A quarter seen through one point is a quarterly series; a partial quarter of monthly data gets no tick.
    else if (g.length === 1) picks.push(g[0])
  }
  if (!picks.length) return []
  const quarterText = picks.map(quarterLabel)
  const monthText = (t: number, first: boolean) => {
    const key = new Date(t).toISOString().slice(0, 10)
    return formatMonthShort(key, first || new Date(t).getUTCMonth() === 0)
  }
  const widest = Math.max(
    ...picks.map((t, i) => measure(unit === 'quarter' ? quarterText[i] : monthText(t, true))),
  )
  const t0 = sorted[0]
  const span = sorted[sorted.length - 1] - t0
  let minGap = Number.POSITIVE_INFINITY
  for (let i = 1; i < picks.length; i++)
    minGap = Math.min(minGap, ((picks[i] - picks[i - 1]) / (span || 1)) * width)
  const every = Number.isFinite(minGap) && minGap > 0 ? Math.max(1, Math.ceil((widest + 12) / minGap)) : 1
  const last = picks.length - 1
  const kept = minThreeTicks(
    picks,
    picks.filter((_, i) => (last - i) % every === 0),
  )
  return kept.map((t, j) => ({
    t,
    label: unit === 'quarter' ? quarterLabel(t) : monthText(t, tickHasYear(kept, j)),
  }))
}

/* ───────── Histogram ───────── */

export interface HistogramBin<T> {
  x0: number
  x1: number
  n: number
  /** Share of all binned values (0-1). */
  share: number
  /** The rows in this bin (empty when the chart was given plain values). */
  rows: T[]
}

export function histogramBins<T>(
  items: readonly { v: number; d: T | null }[],
  thresholds: number | readonly number[],
  domain?: [number, number],
): HistogramBin<T>[] {
  const finite = items.filter((it) => Number.isFinite(it.v))
  if (!finite.length) return []
  let b = d3bin<{ v: number; d: T | null }, number>().value((it) => it.v)
  if (domain) b = b.domain(domain)
  b = typeof thresholds === 'number' ? b.thresholds(thresholds) : b.thresholds(thresholds as number[])
  const bins = b(finite)
  const total = finite.length
  return bins
    .filter((x) => x.x0 !== undefined && x.x1 !== undefined && x.x1 > x.x0)
    .map((x) => ({
      x0: x.x0 as number,
      x1: x.x1 as number,
      n: x.length,
      share: x.length / total,
      rows: x.map((it) => it.d).filter((d): d is T => d !== null),
    }))
}

/* ───────── Dots ───────── */

/** Deterministic jitter in [-1, 1] from a stable id, so dots don't move between renders. */
export function jitter(id: string): number {
  return (fnv(id) / 0xffffffff) * 2 - 1
}

/**
 * Indices of the `count` points farthest from the median center (each axis scaled by its
 * spread), i.e. the ones worth labeling.
 */
export function extremeIndices(points: readonly { x: number; y: number }[], count: number): number[] {
  if (count <= 0 || !points.length) return []
  const med = (xs: number[]) => {
    const s = xs.slice().sort((a, b) => a - b)
    return s[Math.floor(s.length / 2)]
  }
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const mx = med(xs)
  const my = med(ys)
  const sx = Math.max(...xs) - Math.min(...xs) || 1
  const sy = Math.max(...ys) - Math.min(...ys) || 1
  return points
    .map((p, i) => ({ i, dist: ((p.x - mx) / sx) ** 2 + ((p.y - my) / sy) ** 2 }))
    .sort((a, b) => b.dist - a.dist)
    .slice(0, count)
    .map((e) => e.i)
}

/**
 * Spread label positions (pixel centers) so neighbors are at least `gap` apart while staying
 * as close as possible to their targets. Returns adjusted positions in input order.
 */
export function dodge(
  targets: readonly number[],
  gap: number,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
): number[] {
  const order = targets.map((t, i) => ({ t, i })).sort((a, b) => a.t - b.t)
  const pos = order.map((o) => o.t)
  for (let pass = 0; pass < 20; pass++) {
    let moved = false
    for (let k = 1; k < pos.length; k++) {
      const overlap = gap - (pos[k] - pos[k - 1])
      if (overlap > 0.01) {
        pos[k - 1] -= overlap / 2
        pos[k] += overlap / 2
        moved = true
      }
    }
    for (let k = 0; k < pos.length; k++) pos[k] = Math.min(max, Math.max(min, pos[k]))
    if (!moved) break
  }
  const out = new Array<number>(targets.length)
  order.forEach((o, k) => {
    out[o.i] = pos[k]
  })
  return out
}
