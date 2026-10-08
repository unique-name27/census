/**
 * The records behind every number of Engineering by stage, as drill specs (`@/drill`): the people
 * of a stage (employees, contractors or interns), the upcoming starts, the open reqs and the plan
 * lines. Each list carries the stage, how it was found (Saved, Proposed, Inferred from department)
 * and, for people, the FTE. Built on click: callers wrap them in thunks.
 *
 * Stage, job family and job function are not filter dimensions, so only a site or business unit
 * sets "Filter to this" (the heatmap cells and the concentration finding). Pure.
 */
import type { Column } from '@/charts/types'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { Candidate, Employee, HiringPlanLine, Requisition } from '@/data/schema'
import type { FilterDimension } from '@/data/scope'
import { groupFilter } from '@/drill/filter'
import { asOfLine } from '@/drill/subtitle'
import { type DrillFilter, type DrillSpec, drillSpec } from '@/drill/types'
import { formatDate } from '@/lib/dates'
import { onboardingBase } from '@/views/onboarding/engine/base'
import { planDrill, startsDrill } from '@/views/onboarding/engine/drills'
import { type EngPerson, type Placed, STAGE_ROWS, type StagesBase, stageLabel } from './base'
import { openings, type PlacedLine, type PlacedReq, type PlacedStart } from './hiring'
import { STAGES_USES } from './metrics'
import { count } from './wording'

const C = (key: string, label: string, format?: Column['format']): Column => ({ key, label, format })

/** Standard employee columns that say nothing on a list of active people. */
const ACTIVE_HIDE = ['status', 'terminationDate', 'terminationType', 'terminationReason', 'regrettable']

const STAGE_COLUMNS: Column[] = [C('devStage', 'Stage'), C('stageSource', 'Stage source')]

const stageValues = (p: Placed | undefined) => ({
  devStage: p ? stageLabel(p.stage) : null,
  stageSource: p?.source ?? null,
})

/** The scope as a subtitle part: nothing extra for the whole company. */
const scopeOf = (b: StagesBase): string => b.ctx.scopeLabel

export const titled = (...parts: (string | null | undefined | false)[]): string =>
  parts.filter((x): x is string => !!x).join(', ')

/**
 * Engineering people as records: the job family (the row's, else its function's), the stage, how
 * the stage was found and the FTE after the standard columns. Sorted by stage, then name.
 */
export function peopleSpec(
  b: StagesBase,
  title: string,
  people: readonly EngPerson[],
  o: {
    note?: string
    uses?: readonly FieldRef[]
    filter?: DrillFilter
    filterLabel?: string
    date?: string
  } = {},
): DrillSpec<'employees'> | null {
  if (!people.length) return null
  const byRow = new Map<Employee, EngPerson>(people.map((p) => [p.e, p]))
  const rows = [...people]
    .sort((x, y) => stageOrderOf(x) - stageOrderOf(y) || x.e.name.localeCompare(y.e.name))
    .map((p) => p.e)
  const workers = new Set(people.map((p) => p.worker))
  const date = o.date ?? b.asOf
  return drillSpec({
    kind: 'employees',
    title,
    subtitle: asOfLine(date, scopeOf(b)),
    rows,
    hide: workers.size > 1 ? ACTIVE_HIDE : [...ACTIVE_HIDE, 'employmentType'],
    extra: {
      // Job family and job function are standard employee columns.
      columns: [...STAGE_COLUMNS, C('fte', 'FTE', 'num2')],
      values: (e: Employee) => {
        const p = byRow.get(e)
        return { ...stageValues(p), fte: p?.fte ?? null }
      },
    },
    note:
      o.note ??
      (date === b.asOf
        ? undefined
        : `People active on ${formatDate(date)}, shown with their current record.`),
    uses: o.uses ?? STAGES_USES,
    ...(o.filter ? { filter: o.filter } : {}),
    ...(o.filterLabel ? { filterLabel: o.filterLabel } : {}),
  })
}

const ORDER = new Map<string, number>(STAGE_ROWS.map((s, i) => [s.key, i]))
const stageOrderOf = (p: Placed): number => ORDER.get(p.stage) ?? ORDER.size

/** A site's or business unit's people in a stage, with "Filter to" on the group. */
export function groupPeopleSpec(
  b: StagesBase,
  title: string,
  people: readonly EngPerson[],
  dim: Extract<FilterDimension, 'location' | 'businessUnit'>,
  group: string | null,
  o: { note?: string; uses?: readonly FieldRef[] } = {},
): DrillSpec<'employees'> | null {
  const filter = group ? groupFilter(dim, group) : undefined
  return peopleSpec(b, title, people, { ...o, ...(filter ? { filter } : {}) })
}

/** Upcoming starts in engineering as records (Onboarding's list), with their stage. */
export function startsSpec(
  b: StagesBase,
  title: string,
  starts: readonly PlacedStart[],
  o: { note?: string; uses?: readonly FieldRef[] } = {},
): DrillSpec | null {
  if (!starts.length) return null
  const spec = startsDrill(
    onboardingBase(b.ctx),
    starts.map((s) => s.start),
    title,
    { note: o.note, uses: o.uses },
  )
  if (!spec) return null
  const byCandidate = new Map<Candidate, Placed>()
  const byEmployee = new Map<Employee, Placed>()
  for (const s of starts) {
    if (s.start.candidate) byCandidate.set(s.start.candidate, s.place)
    if (s.start.employee) byEmployee.set(s.start.employee, s.place)
  }
  const extra = spec.extra as
    | { columns: Column[]; values: (r: unknown) => Record<string, unknown> }
    | undefined
  return {
    ...spec,
    extra: {
      columns: [...(extra?.columns ?? []), ...STAGE_COLUMNS],
      values: (r: unknown) => ({
        ...(extra?.values(r) ?? {}),
        ...stageValues(
          spec.kind === 'candidates'
            ? (byCandidate.get(r as Candidate) ?? byEmployee.get(r as never))
            : byEmployee.get(r as Employee),
        ),
      }),
    },
  } as DrillSpec
}

/** Open (or on-hold) reqs as records, with the job function and stage inferred from the department. */
export function reqsSpec(
  b: StagesBase,
  title: string,
  reqs: readonly PlacedReq[],
  o: { note?: string; uses?: readonly FieldRef[] } = {},
): DrillSpec<'requisitions'> | null {
  if (!reqs.length) return null
  const byReq = new Map<Requisition, Placed>(reqs.map((r) => [r.req, r.place]))
  const n = openings(reqs)
  return drillSpec({
    kind: 'requisitions',
    title,
    subtitle: asOfLine(
      b.asOf,
      scopeOf(b),
      n === reqs.length ? null : `${count(n, 'opening')} on ${count(reqs.length, 'req')}`,
    ),
    rows: reqs.map((r) => r.req),
    extra: {
      columns: [C('openings', 'Openings', 'int'), C('jobFunction', 'Job function'), ...STAGE_COLUMNS],
      values: (r: Requisition) => {
        const p = byReq.get(r)
        return { openings: r.openings, jobFunction: p?.jobFunction ?? null, ...stageValues(p) }
      },
    },
    note:
      o.note ??
      'Reqs carry no job function, so each takes the most common job function of its department’s active employees.',
    uses: o.uses,
  })
}

/** Plan lines with no req as records (Onboarding's plan list), with the inferred stage. */
export function linesSpec(
  b: StagesBase,
  title: string,
  lines: readonly PlacedLine[],
  o: { note?: string; uses?: readonly FieldRef[] } = {},
): DrillSpec<'hiringPlan'> | null {
  if (!lines.length) return null
  const spec = planDrill(
    onboardingBase(b.ctx),
    lines.map((l) => l.view),
    title,
    {
      note:
        o.note ??
        'Plan lines with no req. Each takes the most common job function of its department’s active employees.',
      uses: o.uses,
    },
  )
  if (!spec) return null
  const byLine = new Map<HiringPlanLine, Placed>(lines.map((l) => [l.view.line, l.place]))
  const extra = spec.extra
  return {
    ...spec,
    extra: {
      columns: [...(extra?.columns ?? []), C('jobFunction', 'Job function'), ...STAGE_COLUMNS],
      values: (l: HiringPlanLine) => {
        const p = byLine.get(l)
        return { ...(extra?.values(l) ?? {}), jobFunction: p?.jobFunction ?? null, ...stageValues(p) }
      },
    },
  }
}
