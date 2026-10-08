/**
 * The rows each quality of hire figure draws and exports (docs/ANALYSES.md, 2.6), and the records
 * every mark and cell opens. Pure, so the tests can recount each number from its rows and check
 * that a drill lists exactly the hires the number is over. Education groups set no "Filter to";
 * the business unit and site cuts do, through `byGroup` in the panel.
 */
import { groupFilter } from '@/drill/filter'
import type { DrillSpec } from '@/drill/types'
import { fmt } from '@/lib/format'
import type { DrillScope } from './drill'
import { hiresSpec } from './drill'
import type { CutKey, DegreeFieldCell, GroupKind, GroupScore } from './groups'
import type { QualityModel } from './model'
import { CLEARLY_LABEL, type Clearly } from './stats'

/** One row of a quality of hire range chart (university, degree level, field, source). */
export interface RangeRow {
  group: string
  kind: GroupKind
  /** Scored hires. */
  hires: number
  q: number | null
  low: number | null
  high: number | null
  expected: number | null
  gap: number | null
  p: number | null
  /** Stayed a year, a fraction. */
  r: number | null
  status: Clearly
  statusLabel: string
  g: GroupScore
}

export type RangeSort = 'hires' | 'score'

const rangeRow = (g: GroupScore): RangeRow => ({
  group: g.label,
  kind: g.kind,
  hires: g.n,
  q: g.q,
  low: g.low,
  high: g.high,
  expected: g.expected,
  gap: g.gap,
  p: g.p,
  r: g.r,
  status: g.status,
  // A hidden mean has no status.
  statusLabel: g.q == null ? '—' : CLEARLY_LABEL[g.status],
  g,
})

/**
 * A cut's rows in its order; `score` sorts the values by quality of hire instead (the
 * university chart's "Sort: Quality of hire"). Other and Not recorded stay last either way.
 */
export function rangeRows(groups: readonly GroupScore[], sort: RangeSort = 'hires'): RangeRow[] {
  const rows = groups.map(rangeRow)
  if (sort === 'hires') return rows
  const values = rows
    .filter((r) => r.kind === 'value')
    .sort(
      (a, b) => (b.q ?? Number.NEGATIVE_INFINITY) - (a.q ?? Number.NEGATIVE_INFINITY) || b.hires - a.hires,
    )
  return [...values, ...rows.filter((r) => r.kind !== 'value')]
}

/** "38 hires · expected 65.8". */
export const rangeSecondary = (r: RangeRow): string | null =>
  r.q == null
    ? `${r.hires.toLocaleString('en-US')} scored`
    : `${r.hires.toLocaleString('en-US')} ${r.hires === 1 ? 'hire' : 'hires'}${r.expected != null ? ` · expected ${fmt(r.expected, 'num1')}` : ''}`

/** The scored hires behind a group's mean; nothing behind a hidden one. */
export function groupDrill(d: DrillScope, what: string, g: GroupScore): DrillSpec<'employees'> | null {
  if (g.q == null) return null
  return hiresSpec(d, `Scored hires, ${what}`, g.scored)
}

/** The rated hires behind a group's first review score. */
export function ratedDrill(d: DrillScope, what: string, g: GroupScore): DrillSpec<'employees'> | null {
  if (g.p == null) return null
  return hiresSpec(d, `Rated hires, ${what}`, g.rated)
}

/** The hires with a retention score behind a group's stayed a year, those who did not stay first. */
export function retainedDrill(d: DrillScope, what: string, g: GroupScore): DrillSpec<'employees'> | null {
  if (g.r == null) return null
  return hiresSpec(d, `Hires with a retention score, ${what}`, g.retained, { order: 'notStayedFirst' })
}

/* ───────── performance and retention by group (2.6.3) ───────── */

/** The cuts of the parts figure, in the control's order. */
export const PART_CUTS = [
  { key: 'degree', label: 'Degree level' },
  { key: 'field', label: 'Field of study' },
  { key: 'source', label: 'Source' },
  { key: 'businessUnit', label: 'Business unit' },
  { key: 'location', label: 'Site' },
] as const satisfies readonly { key: CutKey; label: string }[]

export type PartCut = (typeof PART_CUTS)[number]['key']

/** One group of one cut, long form ("Grouped by"), with both parts. */
export interface PartsRow {
  groupedBy: string
  cut: PartCut
  group: string
  kind: GroupKind | 'company'
  hires: number
  p: number | null
  rated: number
  r: number | null
  retained: number
  g: GroupScore
}

export const FIRST_REVIEW = 'First review score'
export const STAYED = 'Stayed a year, %'

/** Every cut, each led by the company. */
export function partsRows(m: Pick<QualityModel, 'cuts' | 'company'>): PartsRow[] {
  const row = (cut: PartCut, groupedBy: string, g: GroupScore, kind: PartsRow['kind']): PartsRow => ({
    groupedBy,
    cut,
    group: g.label,
    kind,
    hires: g.n,
    p: g.p,
    rated: g.rated.length,
    r: g.r,
    retained: g.retained.length,
    g,
  })
  return PART_CUTS.flatMap(({ key, label }) => [
    row(key, label, m.company, 'company'),
    ...m.cuts[key].map((g) => row(key, label, g, g.kind)),
  ])
}

/** One bar of the parts chart: a group's first review score or stayed a year, both 0 to 100. */
export interface PartsBar {
  group: string
  measure: typeof FIRST_REVIEW | typeof STAYED
  value: number | null
  row: PartsRow
}

export function partsBars(rows: readonly PartsRow[], cut: PartCut): PartsBar[] {
  return rows
    .filter((r) => r.cut === cut)
    .flatMap((row) => [
      { group: row.group, measure: FIRST_REVIEW, value: row.p, row },
      { group: row.group, measure: STAYED, value: row.r == null ? null : row.r * 100, row },
    ])
}

/** The filter dimension of a cut's rows, when its groups are a filter's values. */
export const partFilter = (cut: PartCut): 'businessUnit' | 'location' | null =>
  cut === 'businessUnit' ? 'businessUnit' : cut === 'location' ? 'location' : null

/** A row's value for "Filter to": only real groups of a filterable cut. */
export const partGroupValue = (r: Pick<PartsRow, 'cut' | 'kind' | 'group'>): string | null =>
  partFilter(r.cut) && r.kind === 'value' ? r.group : null

/** The records behind a row: the company row lists the company's hires. */
export const partsScope = (m: Pick<QualityModel, 'drill' | 'companyDrill'>, r: PartsRow): DrillScope =>
  r.kind === 'company' ? m.companyDrill : m.drill

/** Which hires a parts number is over: scored (its row), rated (first review score) or retained. */
export type PartMeasure = 'scored' | 'rated' | 'retained'

/**
 * The records behind a parts row's number, built on click; nothing behind a hidden one. A
 * business unit or site row carries its group as the drill's filter ("Filter to Bengaluru").
 */
export function partsDrill(
  m: Pick<QualityModel, 'drill' | 'companyDrill'>,
  measure: PartMeasure,
): (r: PartsRow) => (() => DrillSpec<'employees'> | null) | null {
  return (r) => {
    const g = r.g
    const shown = measure === 'scored' ? g.q != null : measure === 'rated' ? g.p != null : g.r != null
    if (!shown) return null
    const dim = partFilter(r.cut)
    const value = partGroupValue(r)
    const filter = dim && value ? groupFilter(dim, value) : undefined
    const d = partsScope(m, r)
    const what = r.kind === 'company' ? 'company' : r.group
    return () =>
      measure === 'scored'
        ? hiresSpec(d, `Scored hires, ${what}`, g.scored, { filter })
        : measure === 'rated'
          ? hiresSpec(d, `Rated hires, ${what}`, g.rated, { filter })
          : hiresSpec(d, `Hires with a retention score, ${what}`, g.retained, {
              filter,
              order: 'notStayedFirst',
            })
  }
}

/* ───────── degree level by field of study (2.6.6) ───────── */

export interface CellRow {
  field: string
  degree: string
  hires: number
  q: number | null
  p: number | null
  r: number | null
  cell: DegreeFieldCell
}

export const cellRows = (cells: readonly DegreeFieldCell[]): CellRow[] =>
  cells.map((cell) => ({
    field: cell.field,
    degree: cell.degree,
    hires: cell.n,
    q: cell.q,
    p: cell.p,
    r: cell.r,
    cell,
  }))

export function cellDrill(d: DrillScope, c: CellRow): DrillSpec<'employees'> | null {
  if (c.q == null) return null
  return hiresSpec(d, `Scored hires, ${c.degree} in ${c.field}`, c.cell.scored)
}
