/**
 * Text and tone for KPI tiles, and the rows a KPI strip contributes to view exports. Pure.
 */
import type { Column } from '@/charts/types'
import { TIER_LABEL } from '@/data/quality/tier'
import { MIN_GROUP } from '@/data/schema'
import type { RouteView } from '@/data/store'
import { DASH, type Format, fmt, fmtDelta, isNum, plural } from '@/lib/format'
import type { CurrentView } from './currentView'
import type { TierGate } from './tier/tierModel'
import type { Kpi } from './types'

export const SUPPRESSED_NOTE = `Hidden to protect anonymity (n < ${MIN_GROUP})`

export type DeltaTone = 'good' | 'bad' | 'neutral'

export function deltaDirection(delta: number | null | undefined): 'up' | 'down' | 'flat' | null {
  if (!isNum(delta)) return null
  return delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
}

/**
 * Good or bad only when the KPI says which direction is good AND the change is material;
 * everything else (neutral KPIs, small changes, no change) stays gray.
 */
export function deltaTone(
  k: Pick<Kpi, 'delta' | 'goodDirection' | 'deltaMaterial' | 'suppressed'>,
): DeltaTone {
  const dir = deltaDirection(k.delta)
  if (k.suppressed || !k.goodDirection || k.deltaMaterial === false || !dir || dir === 'flat')
    return 'neutral'
  return dir === k.goodDirection ? 'good' : 'bad'
}

export function kpiValueText(k: Pick<Kpi, 'value' | 'format' | 'suppressed'>): string {
  return k.suppressed ? DASH : fmt(k.value, k.format)
}

/** "+4 d", "−1.2 pts"; null when there is no comparable delta. */
export function kpiDeltaText(k: Pick<Kpi, 'delta' | 'format' | 'suppressed'>): string | null {
  if (k.suppressed || !isNum(k.delta)) return null
  return fmtDelta(k.delta, k.format)
}

/** Where a tile opens: `view` and `tab`, and its name for the accessible label. */
export interface TileTarget {
  view: RouteView
  tab: string
  label: string
}

/**
 * Where clicking a tile goes: another view's tab when it carries a `link`, else a tab of the
 * view showing it (`tab`, named by that view's tab label); null when it opens nothing.
 */
export function tileTarget(
  k: Pick<Kpi, 'tab' | 'link'>,
  view: Pick<CurrentView, 'key' | 'tabs'> | null,
): TileTarget | null {
  if (k.link) return { view: k.link.view, tab: k.link.tab ?? '', label: k.link.label }
  if (!k.tab || !view) return null
  return { view: view.key, tab: k.tab, label: view.tabs.find((t) => t.key === k.tab)?.label ?? k.tab }
}

/** The unit a number in `format` is counted in, for the unit columns of exports. */
export function unitOf(format: Format): string {
  switch (format) {
    case 'pct':
    case 'pct0':
    case 'pct2':
    case 'deltaPct':
      return '%'
    case 'pts':
    case 'pts2':
      return 'pts'
    case 'days':
    case 'deltaDays':
      return 'd'
    case 'hours':
      return 'h'
    case 'years':
      return 'yrs'
    case 'money':
    case 'moneyFull':
      return 'USD'
    case 'times':
      return '×'
    case 'int':
    case 'compact':
      return 'count'
    case 'ratio':
      return 'ratio'
    default:
      return ''
  }
}

/** A number as the key figures export stores it: in its unit, with the format that shows it. */
interface ExportCell {
  value: number | null
  format: Format
  unit: string
}

const POINTS = new Set<Format>(['pts', 'pts2'])
/** Formats whose change is a difference in percentage points. */
const RATE_CHANGE = new Set<Format>(['pct', 'pct0', 'pct2', 'pts', 'pts2', 'deltaPct'])
const FINE = new Set<Format>(['pct2', 'pts2'])

const num = (v: number | null | undefined): number | null => (isNum(v) ? v : null)
/** Points are fractions in the engines; exports store them as a number of points (2.1, not 0.021). */
const toPoints = (v: number | null): number | null => (v == null ? null : v * 100)

/** A value or trend point: rates stay fractions (Excel shows them as %), points become points. */
export function valueCell(v: number | null | undefined, format: Format): ExportCell {
  const n = num(v)
  if (POINTS.has(format))
    return { value: toPoints(n), format: FINE.has(format) ? 'num2' : 'num1', unit: 'pts' }
  return { value: n, format, unit: unitOf(format) }
}

/** The change, in the unit the tile shows it in: points for a rate, else the value's own unit. */
export function changeCell(delta: number | null | undefined, format: Format): ExportCell {
  const n = num(delta)
  if (RATE_CHANGE.has(format))
    return { value: toPoints(n), format: FINE.has(format) ? 'num2' : 'num1', unit: 'pts' }
  return { value: n, format, unit: unitOf(format) }
}

/** Hidden row keys holding each row's own number formats (units differ by row). */
const VALUE_FORMAT = '__valueFormat'
const CHANGE_FORMAT = '__changeFormat'
const TREND_FORMAT = '__trendFormat'
const formatAt =
  (key: string) =>
  (row: Record<string, unknown>): Format =>
    (row[key] as Format | undefined) ?? 'num2'

const trendKey = (back: number) => `trend${back}`
/** "Trend, 3 periods back" … "Trend, latest": the latest point lines up across tiles. */
const trendLabel = (back: number) => (back === 0 ? 'Trend, latest' : `Trend, ${plural(back, 'period')} back`)

/** Trend points a tile shows (none when its number is hidden or suppressed). */
function shownSpark(k: Kpi, gate: TierGate | null | undefined): readonly (number | null)[] {
  if (k.suppressed || (gate && !gate.shown) || !k.spark || k.spark.length < 2) return []
  return k.spark
}

/**
 * Columns of the "Key figures" table. Sheets (Excel, CSV, copy) get numbers: each value with its
 * unit, the change with its unit, and one column per trend point (the tile's sparkline), oldest
 * first. Slides get the tile's own text ("42 d", "+4 d") and no trend: a dozen points would not fit.
 */
export function kpiColumns(
  kpis: readonly Kpi[],
  opts: {
    tiered?: boolean
    gates?: readonly (TierGate | null)[]
    /** Each tile's target in words ("Met: target at most 8.0%"), or null; a column when any has one. */
    targets?: readonly (string | null)[]
  } = {},
): Column[] {
  const points = Math.max(0, ...kpis.map((k, i) => shownSpark(k, opts.gates?.[i]).length))
  const trend: Column[] = []
  for (let back = points - 1; back >= 0; back--)
    trend.push({
      key: trendKey(back),
      label: trendLabel(back),
      format: formatAt(TREND_FORMAT),
      only: 'sheets',
    })
  return [
    { key: 'measure', label: 'Measure', format: 'text' },
    { key: 'value', label: 'Value', format: formatAt(VALUE_FORMAT), align: 'right', only: 'sheets' },
    { key: 'valueText', label: 'Value', format: 'text', align: 'right', only: 'slides' },
    { key: 'unit', label: 'Unit', format: 'text', only: 'sheets' },
    ...(opts.tiered ? [{ key: 'tier', label: 'Tier', format: 'text' } satisfies Column] : []),
    { key: 'change', label: 'Change', format: formatAt(CHANGE_FORMAT), align: 'right', only: 'sheets' },
    { key: 'changeText', label: 'Change', format: 'text', align: 'right', only: 'slides' },
    { key: 'changeUnit', label: 'Change unit', format: 'text', only: 'sheets' },
    { key: 'comparedWith', label: 'Compared with', format: 'text' },
    ...(opts.targets?.some(Boolean)
      ? [{ key: 'target', label: 'Target', format: 'text' } satisfies Column]
      : []),
    { key: 'note', label: 'Note', format: 'text' },
    ...trend,
  ]
}

/**
 * Rows for the "Key figures" table in view exports: numbers (not text), each with its own format
 * and unit, so a workbook can sum and chart them, plus the tile's text for slides. With `gates`
 * (one per KPI), each row carries its tier, and a number the data standard hides exports blank
 * (a dash on slides) with the reason, as the tile shows it. A suppressed number is blank with the
 * anonymity note.
 */
export function kpiRows(
  kpis: readonly Kpi[],
  gates?: readonly (TierGate | null)[],
  targets?: readonly (string | null)[],
): Record<string, unknown>[] {
  return kpis.map((k, i) => {
    const gate = gates?.[i] ?? null
    const hidden = !!gate && !gate.shown
    const blank = hidden || !!k.suppressed
    const value = valueCell(blank ? null : k.value, k.format)
    const change = changeCell(blank ? null : k.delta, k.format)
    const changeText = blank ? null : kpiDeltaText(k)
    const row: Record<string, unknown> = {
      measure: k.label,
      value: value.value,
      valueText: hidden ? DASH : kpiValueText(k),
      unit: value.unit,
      change: change.value,
      changeText: changeText ?? '',
      changeUnit: change.value == null ? '' : change.unit,
      comparedWith: change.value == null ? '' : (k.deltaLabel ?? ''),
      note: hidden ? (gate.reason ?? '') : k.suppressed ? SUPPRESSED_NOTE : (k.note ?? ''),
      [VALUE_FORMAT]: value.format,
      [CHANGE_FORMAT]: change.format,
      [TREND_FORMAT]: value.format,
    }
    const spark = shownSpark(k, gate)
    spark.forEach((v, j) => {
      row[trendKey(spark.length - 1 - j)] = valueCell(v, k.format).value
    })
    if (gates) row.tier = gate ? TIER_LABEL[gate.tier] : ''
    if (targets) row.target = blank ? '' : (targets[i] ?? '')
    return row
  })
}
