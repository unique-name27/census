/**
 * The People scorecard's exports as data: the scorecard table (on screen, in the workbook and,
 * split at practice boundaries, on slides), the findings tables, and which figure of a view's
 * first tab is its lead chart for the monthly people report. Pure.
 */
import type { Column, RegisteredFigure } from '@/charts/types'
import { kpiColumns, kpiDeltaText, kpiRows } from '@/components/kpiModel'
import { peopleCount, SEVERITY_WORD } from '@/components/readoutModel'
import { TIER_LABEL } from '@/data/quality/tier'
import type { ISODate } from '@/data/schema'
import { plural } from '@/lib/format'
import type { Practice, ScorecardModel, ScoreRow, SourcedFinding } from './model'
import { STATUS_WORD } from './status'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** The month the report covers, from the as-of date: "September 2026". */
export function reportMonth(asOf: ISODate): string {
  const [y, m] = asOf.split('-').map(Number)
  return `${MONTHS[(m || 1) - 1]} ${y}`
}

/** `census-people-report-2026-09-30`. */
export const reportFileName = (asOf: ISODate): string => `census-people-report-${asOf}`

/* ───────────── the scorecard table ───────────── */

export interface ExportTableData {
  columns: Column[]
  rows: Record<string, unknown>[]
}

/**
 * The scorecard as the figure exports it: one row per measure (practice, measure, value with its
 * unit, tier, change, target, status, note and the trend points), and one row with the reason for
 * a practice that shows no measure. A number the data standard hides exports blank with the reason.
 */
export function scorecardTable(model: Pick<ScorecardModel, 'practices'>): ExportTableData {
  const rows = model.practices.flatMap((p) => p.rows)
  const kpis = rows.map((r) => r.kpi)
  const gates = rows.map((r) => r.gate)
  const tiered = gates.some(Boolean)
  const targets = rows.map((r) => r.targetText)
  const base = kpiColumns(kpis, { tiered, gates, targets: targets.length ? targets : ['No target'] })
  const columns: Column[] = [{ key: 'practice', label: 'Practice', format: 'text' }]
  for (const c of base) {
    columns.push(c)
    if (c.key === 'target') columns.push({ key: 'status', label: 'Status', format: 'text' })
  }
  const measureRows = kpiRows(kpis, tiered ? gates : undefined, targets)
  const byId = new Map(rows.map((r, i) => [r.id, measureRows[i]]))
  const out: Record<string, unknown>[] = []
  for (const p of model.practices) {
    for (const r of p.rows)
      out.push({ practice: p.label, ...byId.get(r.id), target: r.targetText, status: STATUS_WORD[r.status] })
    if (!p.rows.length && p.empty) out.push({ practice: p.label, measure: '', note: p.empty })
  }
  return { columns, rows: out }
}

/** Columns of the scorecard on a slide: what a reader in the room needs, as the page prints it. */
export const SLIDE_COLUMNS: Column[] = [
  { key: 'practice', label: 'Practice', format: 'text' },
  { key: 'measure', label: 'Measure', format: 'text' },
  { key: 'valueText', label: 'Value', format: 'text', align: 'right' },
  { key: 'target', label: 'Target', format: 'text' },
  { key: 'status', label: 'Status', format: 'text' },
  { key: 'changeText', label: 'Change', format: 'text', align: 'right' },
]

/** Rows a slide table holds before the deck cuts it short; parts stay under it. */
export const SLIDE_ROWS = 12

const slideRow = (p: Practice, r: ScoreRow) => ({
  practice: p.label,
  measure: r.kpi.label,
  valueText: r.valueText,
  target: r.targetText,
  status: STATUS_WORD[r.status],
  changeText: r.hiddenReason ? '' : (kpiDeltaText(r.kpi) ?? ''),
})

/**
 * The scorecard split into slide-sized parts at practice boundaries, the practice named on every
 * row (a blank cell would print as a dash). A practice with no measure shows its reason.
 */
export function scorecardSlides(
  model: Pick<ScorecardModel, 'practices'>,
  maxRows = SLIDE_ROWS,
): Record<string, unknown>[][] {
  const blocks = model.practices.map((p) =>
    p.rows.length
      ? p.rows.map((r) => slideRow(p, r))
      : p.empty
        ? [{ practice: p.label, measure: p.empty, valueText: '', target: '', status: '', changeText: '' }]
        : [],
  )
  const parts: Record<string, unknown>[][] = []
  let cur: Record<string, unknown>[] = []
  for (const b of blocks) {
    if (!b.length) continue
    if (cur.length && cur.length + b.length > maxRows) {
      parts.push(cur)
      cur = []
    }
    cur.push(...b)
  }
  if (cur.length) parts.push(cur)
  return parts
}

/** "9 of 14 targets met; 3 missed and 2 to watch." */
export function standingLine(c: ScorecardModel['counts']): string {
  if (!c.judged) return 'No measure with a target has a value shown yet.'
  const rest = [c.missed ? `${c.missed} missed` : '', c.watch ? `${c.watch} to watch` : ''].filter(Boolean)
  const head = `${c.met} of ${plural(c.judged, 'target')} met`
  return rest.length ? `${head}; ${rest.join(' and ')}.` : `${head}.`
}

/* ───────────── findings ───────────── */

/** The findings as the workbook and the readout export them, with the practice each comes from. */
export const FINDING_COLUMNS: Column[] = [
  { key: 'severity', label: 'Severity', format: 'text' },
  { key: 'practice', label: 'Practice', format: 'text' },
  { key: 'finding', label: 'Finding', format: 'text' },
  { key: 'tier', label: 'Tier', format: 'text', only: 'sheets' },
  { key: 'detail', label: 'Detail', format: 'text', only: 'sheets' },
  { key: 'nextStep', label: 'Next step', format: 'text' },
  { key: 'people', label: 'People', format: 'int', align: 'right', only: 'sheets' },
]

/** One row per finding, in the order given. People are counted, never named. */
export function findingRows(
  list: readonly SourcedFinding[],
  tierOf: (s: SourcedFinding) => keyof typeof TIER_LABEL | null = () => null,
): Record<string, unknown>[] {
  return list.map((s) => {
    const t = tierOf(s)
    return {
      severity: SEVERITY_WORD[s.finding.severity],
      practice: s.practice,
      finding: s.finding.title,
      tier: t ? TIER_LABEL[t] : '',
      detail: s.finding.detail ?? '',
      nextStep: s.finding.action ?? '',
      people: peopleCount(s.finding),
    }
  })
}

/* ───────────── a view's lead chart ───────────── */

/** The figure's own id, without the tab prefix the whole-view export adds ("overview:readout"). */
const baseId = (id: string) => id.slice(id.lastIndexOf(':') + 1)

/** The KPI strip registers as "key-figures" (or "<view>-key-figures"), the readout as "readout". */
const isKind = (id: string, kind: 'key-figures' | 'readout') => {
  const b = baseId(id)
  return b === kind || b.endsWith(`-${kind}`)
}

/** The KPI strip of a laid-out tab, exported as "Key figures". */
export function keyFiguresOf(figures: readonly RegisteredFigure[]): RegisteredFigure | null {
  return figures.find((f) => isKind(f.id, 'key-figures')) ?? null
}

/**
 * A view's lead chart: the first figure after the KPI strip and the readout that draws a chart
 * (the Overview layout puts it beside the readout), else the first such figure at all.
 */
export function pickLead(figures: readonly RegisteredFigure[]): RegisteredFigure | null {
  const own = [...figures]
    .sort((a, b) => a.order - b.order)
    .filter((f) => !isKind(f.id, 'key-figures') && !isKind(f.id, 'readout'))
  return own.find((f) => !f.withheld && f.getSvg() != null) ?? own[0] ?? null
}

/** A copy of a registered figure that no longer needs the page: its image was captured already. */
export function detached(f: RegisteredFigure, id: string, title = f.title): RegisteredFigure {
  return { ...f, id, title, columns: [...f.columns], rows: [...f.rows], getSvg: () => null }
}
