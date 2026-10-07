/**
 * A chart Ask drew (`AskChart`, docs/ASK-ACTIONS.md part 4) as the chart kit draws it: which kit
 * component, the props it takes, the rows (names already put back with `chartWithNames`), and the
 * columns the Figure's table view and exports use. Pure, so the mapping is tested; the React side
 * is `AskChartFigure`.
 *
 * Every row keeps its index (`ROW_INDEX`), so a mark opens the records of the row it draws
 * (`chart.refs[i]`). Helper fields (`__x`, the index) are left out of the columns, so exports show
 * the source's fields only.
 */
import type { AskChart, ChartColumn, ChartFieldKind } from '@/ask/engine'
import type { DrillSpec } from '@/drill/types'
import { formatMonth } from '@/lib/dates'
import type { Format } from '@/lib/format'

/** The field holding a row's index in `chart.rows` (and `chart.refs`). */
export const ROW_INDEX = '__i'

export type ChartCell = string | number | boolean | null
export type ChartRow = Record<string, ChartCell>

export type KitSpec =
  | { kit: 'BarList'; label: string; value: string; format: Format }
  | { kit: 'HBars'; y: string; x: string; series: string; seriesOrder: string[]; format: Format }
  | {
      kit: 'Columns'
      x: string
      y: string
      series: string | null
      seriesOrder: string[] | undefined
      stack: boolean
      xType: 'band' | 'month'
      xOrder: string[] | undefined
      format: Format
    }
  | {
      kit: 'Lines'
      x: string
      y: string
      series: string | null
      seriesOrder: string[] | undefined
      format: Format
      /** Names for the x values: quarters and years, drawn at their first month (null for months and dates). */
      xNames: Record<string, string> | null
    }
  | {
      kit: 'Heatmap'
      x: string
      y: string
      value: string
      xOrder: string[]
      yOrder: string[]
      format: Format
    }
  | {
      kit: 'Scatter'
      x: string
      y: string
      label: string | undefined
      xFormat: Format
      yFormat: Format
      xLabel: string
      yLabel: string
    }
  | { kit: 'DotStrip'; x: string; y: string; label: string | undefined; xFormat: Format; yOrder: string[] }
  | { kit: 'Histogram'; value: string; format: Format; unit: string }
  | { kit: 'BulletList'; label: string; value: string; target: string }

export interface ChartColumnView {
  key: string
  label: string
  /** One format, or the row field that holds each row's own. */
  format: Format
  formatKey?: string
  /** Its cells open the row's records (the numbers the chart draws). */
  drills: boolean
  /** The row field the table sorts it by, when the value shown does not sort in order (months). */
  sortKey?: string
}

export interface ChartView {
  spec: KitSpec
  rows: ChartRow[]
  /**
   * The rows as the table view and exports show them: months and quarters in words ("Apr 2026",
   * "Q2 2026") where the chart's axis takes their keys.
   */
  tableRows: ChartRow[]
  columns: ChartColumnView[]
  /** The field whose value each mark draws. */
  measure: string
}

const YES_NO = (v: ChartCell): ChartCell => (v === true ? 'Yes' : v === false ? 'No' : v)

/** A month or quarter key in words ("2026-04" is "Apr 2026", "2026 Q2" is "Q2 2026"); null for anything else. */
export function periodLabel(kind: ChartFieldKind, v: ChartCell): string | null {
  if (typeof v !== 'string') return null
  if (kind === 'month' && /^\d{4}-\d{2}$/.test(v)) return formatMonth(`${v}-01`)
  const q = kind === 'quarter' ? /^(\d{4}) (Q[1-4])$/.exec(v) : null
  return q ? `${q[2]} ${q[1]}` : null
}

const sortKeyOf = (key: string): string => `__sort_${key}`

/** The distinct values of a field, in row order (the engine has already sorted the rows). */
export function distinctOf(rows: readonly ChartRow[], key: string | null): string[] {
  if (!key) return []
  const seen = new Set<string>()
  for (const r of rows) {
    const v = r[key]
    if (v != null) seen.add(String(v))
  }
  return [...seen]
}

const colOf = (c: AskChart, key: string | null): ChartColumn | undefined =>
  key ? c.columns.find((x) => x.key === key) : undefined

/** The format a field's numbers print in (a per-row format reads as its first row's). */
export function formatOf(c: AskChart, key: string | null, rows: readonly ChartRow[] = c.rows): Format {
  const col = colOf(c, key)
  if (!col) return 'int'
  if (col.formatKey) {
    const f = rows.find((r) => typeof r[col.formatKey as string] === 'string')?.[col.formatKey]
    return (typeof f === 'string' ? f : col.format) as Format
  }
  return col.format
}

/** A row's own format for a field: per row when the column says so. */
export function rowFormat(c: AskChart, key: string, row: ChartRow): Format {
  const col = colOf(c, key)
  if (col?.formatKey && typeof row[col.formatKey] === 'string') return row[col.formatKey] as Format
  return col?.format ?? 'int'
}

/** The field whose value each mark draws, for the form. */
export function measureOf(c: Pick<AskChart, 'form' | 'xLabel' | 'y' | 'value'>): string {
  if (c.form === 'heatmap') return c.value ?? ''
  if (c.form === 'histogram' || c.form === 'dot_strip') return c.xLabel ?? ''
  return c.y ?? ''
}

const req = (v: string | null, what: string): string => {
  if (!v) throw new Error(`Ask chart: ${what} is missing`)
  return v
}

/**
 * The view for a chart. Category fields read as text (true and false as Yes and No) so axes and
 * tooltips name them; numbers stay numbers.
 */
export function chartView(c: AskChart): ChartView {
  const categories = new Set(
    c.columns.filter((col) => col.kind === 'boolean' || col.kind === 'category').map((col) => col.key),
  )
  const rows: ChartRow[] = c.rows.map((r, i) => {
    const out: ChartRow = { ...r, [ROW_INDEX]: i }
    for (const k of categories) if (k in out) out[k] = YES_NO(out[k] ?? null)
    return out
  })
  const measure = measureOf(c)
  const numbers = new Set([measure, c.form === 'scatter' ? c.x : null, c.target].filter(Boolean) as string[])
  // Months and quarters read as words in the table and exports, and sort by their keys.
  const timeCols = c.columns.filter((col) => col.kind === 'month' || col.kind === 'quarter')
  const tableRows: ChartRow[] = timeCols.length
    ? rows.map((r) => {
        const out: ChartRow = { ...r }
        for (const col of timeCols) {
          const label = periodLabel(col.kind, r[col.key] ?? null)
          if (label == null) continue
          out[sortKeyOf(col.key)] = r[col.key] ?? null
          out[col.key] = label
        }
        return out
      })
    : rows
  const columns: ChartColumnView[] = c.columns.map((col) => ({
    key: col.key,
    label: col.label,
    format: col.format,
    ...(col.formatKey ? { formatKey: col.formatKey } : {}),
    drills: numbers.has(col.key) && col.kind === 'number' && col.key !== c.target,
    ...(timeCols.includes(col) ? { sortKey: sortKeyOf(col.key) } : {}),
  }))
  return { spec: kitSpec(c, rows), rows, tableRows, columns, measure }
}

function kitSpec(c: AskChart, rows: readonly ChartRow[]): KitSpec {
  const fmt = (k: string | null) => formatOf(c, k, rows)
  const seriesOrder = c.series ? distinctOf(rows, c.series) : undefined
  switch (c.form) {
    case 'bars': {
      const x = req(c.x, 'x')
      const y = req(c.y, 'y')
      if (c.series)
        return { kit: 'HBars', y: x, x: y, series: c.series, seriesOrder: seriesOrder ?? [], format: fmt(y) }
      return { kit: 'BarList', label: x, value: y, format: fmt(y) }
    }
    case 'columns':
    case 'stacked_columns': {
      const x = req(c.x, 'x')
      return {
        kit: 'Columns',
        x,
        y: req(c.y, 'y'),
        series: c.series,
        seriesOrder,
        stack: c.form === 'stacked_columns',
        xType: c.xType,
        xOrder: c.xType === 'band' ? distinctOf(rows, x) : undefined,
        format: fmt(c.y),
      }
    }
    case 'lines': {
      const x = req(c.x, 'x')
      // Quarters and years are drawn at their first month and named on the axis ("2026 Q3"; the
      // kit thins the names to fit). Months and dates keep the kit's own time ticks.
      const kind = colOf(c, c.xLabel)?.kind
      const named = c.xLabel && c.xLabel !== x && (kind === 'quarter' || kind === 'year') ? c.xLabel : null
      let xNames: Record<string, string> | null = null
      if (named) {
        xNames = {}
        for (const r of rows) {
          const at = r[x]
          const name = r[named]
          if (typeof at === 'string' && name != null) xNames[at] = String(name)
        }
      }
      return { kit: 'Lines', x, y: req(c.y, 'y'), series: c.series, seriesOrder, format: fmt(c.y), xNames }
    }
    case 'heatmap': {
      const x = req(c.x, 'x')
      const y = req(c.y, 'y')
      return {
        kit: 'Heatmap',
        x,
        y,
        value: req(c.value, 'value'),
        xOrder: distinctOf(rows, x),
        yOrder: distinctOf(rows, y),
        format: fmt(c.value),
      }
    }
    case 'scatter': {
      const x = req(c.x, 'x')
      const y = req(c.y, 'y')
      return {
        kit: 'Scatter',
        x,
        y,
        label: c.label ?? undefined,
        xFormat: fmt(x),
        yFormat: fmt(y),
        xLabel: colOf(c, x)?.label ?? x,
        yLabel: colOf(c, y)?.label ?? y,
      }
    }
    case 'dot_strip': {
      const y = req(c.y, 'y')
      return {
        kit: 'DotStrip',
        x: req(c.xLabel ?? c.x, 'x'),
        y,
        label: c.label ?? undefined,
        xFormat: fmt(c.xLabel ?? c.x),
        yOrder: distinctOf(rows, y),
      }
    }
    case 'histogram': {
      const value = req(c.xLabel ?? c.x, 'x')
      return { kit: 'Histogram', value, format: fmt(value), unit: 'groups' }
    }
    case 'bullets':
      return {
        kit: 'BulletList',
        label: req(c.x, 'x'),
        value: req(c.y, 'y'),
        target: req(c.target, 'target'),
      }
  }
}

/** The refs behind a set of rows (a histogram bin), without repeats or blanks. */
export function refsOf(c: Pick<AskChart, 'refs'>, rows: readonly ChartRow[]): string[] {
  const out: string[] = []
  for (const r of rows) {
    const i = r[ROW_INDEX]
    const ref = typeof i === 'number' ? c.refs[i] : null
    if (ref && !out.includes(ref)) out.push(ref)
  }
  return out
}

/** The ref behind one row. */
export function refOf(c: Pick<AskChart, 'refs'>, row: ChartRow | null | undefined): string | null {
  const i = row?.[ROW_INDEX]
  return typeof i === 'number' ? (c.refs[i] ?? null) : null
}

/**
 * The line under the chart: the scope and period the numbers are for, then what was left out or
 * hidden and why (the engine's notes), in plain sentences.
 */
export function chartNote(c: Pick<AskChart, 'scope' | 'period' | 'notes'>): string {
  const scope = c.scope.charAt(0).toUpperCase() + c.scope.slice(1)
  const lead = `${scope}, ${c.period}.`
  return [lead, ...c.notes.map((n) => (/[.!?]$/.test(n) ? n : `${n}.`))].join(' ')
}

/**
 * The chart's "Where the numbers come from" definition, in one sentence: "Employees, counted from
 * records, for the whole company, as of 30 Jun 2026."
 */
export function chartSourceText(c: Pick<AskChart, 'source' | 'scope' | 'period'>): string {
  const source = c.source.charAt(0).toUpperCase() + c.source.slice(1)
  const scope = c.scope.replace(/^Whole company/, 'the whole company')
  const where = [scope ? `for ${scope}` : '', c.period].filter(Boolean).join(', ')
  return `${source}${where ? `, ${where}` : ''}.`
}

/** What the export files say the chart is: "Ask Census" as the view, and the chart's own scope and period. */
export function chartExportMeta(c: Pick<AskChart, 'scope' | 'period'>): { scope: string; window: string } {
  return { scope: c.scope, window: c.period }
}

/**
 * One records list for several rows (a histogram bin): their records together when they are of
 * one kind, under the bin's own title; null when there are none or the kinds differ.
 */
export function mergeDrills(specs: readonly (DrillSpec | null)[], title: string): DrillSpec | null {
  const list = specs.filter((s): s is DrillSpec => !!s)
  const first = list[0]
  if (!first) return null
  if (list.length === 1) return first
  if (list.some((s) => s.kind !== first.kind)) return null
  const { filter: _filter, ...rest } = first
  return { ...rest, title, rows: list.flatMap((s) => s.rows) } as DrillSpec
}
