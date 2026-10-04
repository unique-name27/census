/**
 * The records behind every onboarding number (src/drill): the people who start, their tasks, the
 * accepted offers, requisitions, plan lines, learning assignments, HR transactions and grouped
 * survey results. Each builder returns null when there is nothing behind the number.
 */
import type { Column } from '@/charts/types'
import type { FieldRef } from '@/data/quality/fieldRef'
import type {
  Candidate,
  Employee,
  HrTransaction,
  LearningRecord,
  OnboardingTask,
  Requisition,
  SurveyType,
} from '@/data/schema'
import { PERSON_KEY } from '@/drill/records'
import { type DrillSpec, drillSpec } from '@/drill/types'
import { formatDate, formatRange } from '@/lib/dates'
import { type Breakdown, groupRows, type SurveyAggregate } from '@/lib/surveys'
import type { OnboardingBase } from './base'
import { COVERAGE_LABEL, type PlanLineView } from './plan'
import { type Readiness, readinessOf, type Start, type TaskView } from './starts'

type Uses = readonly FieldRef[] | undefined

/** "1 Oct 2025 – 30 Sep 2026 · Whole company". */
export const windowSub = (b: OnboardingBase, w: { start: string; end: string } = b.window): string =>
  `${formatRange(w.start, w.end)} · ${b.scopeLabel}`

/** "On 30 Sep 2026 · Whole company". */
export const asOfSub = (b: OnboardingBase): string => `On ${formatDate(b.asOf)} · ${b.scopeLabel}`

const C = (key: string, label: string, extra: Partial<Column> = {}): Column => ({ key, label, ...extra })

const blockingText = (r: Readiness): string | null =>
  r.blocking ? `${r.blocking.name}${r.blocking.due ? `, due ${formatDate(r.blocking.due)}` : ''}` : null

const START_COLUMNS: Column[] = [
  C('employeeId', 'Pre-hire ID'),
  C('location', 'Location'),
  C('hiringManager', 'Hiring manager'),
  C('daysToGo', 'Days to go', { format: 'days' }),
  C('readiness', 'Day-one tasks'),
  C('readinessStatus', 'Readiness'),
  C('blocking', 'Blocking item'),
]

/**
 * Upcoming starts as records: the accepted offers when every start has one (pre-hires are copies
 * of them, and a pre-hire row opens the person card), else the pre-hire employee records.
 */
export function startsDrill(
  b: OnboardingBase,
  starts: readonly Start[],
  title: string,
  o: { subtitle?: string; note?: string; uses?: Uses } = {},
): DrillSpec | null {
  if (!starts.length) return null
  const ready = new Map(starts.map((s) => [s, readinessOf(s, b.asOf, b.settings)]))
  const extra = (s: Start) => {
    const r = ready.get(s)!
    return {
      employeeId: s.employee?.employeeId ?? null,
      location: s.location,
      hiringManager: s.hiringManager,
      daysToGo: r.daysToGo,
      readiness: r.total ? `${r.done} of ${r.total} done` : null,
      readinessStatus: r.status === 'No tasks' ? null : r.status,
      blocking: blockingText(r),
    }
  }
  const subtitle = o.subtitle ?? asOfSub(b)
  const withCandidate = starts.filter((s) => s.candidate)
  if (withCandidate.length === starts.length || !starts.every((s) => s.employee)) {
    const left = starts.length - withCandidate.length
    const byCand = new Map(withCandidate.map((s) => [s.candidate!, s]))
    return drillSpec({
      kind: 'candidates',
      title,
      subtitle,
      rows: withCandidate.map((s) => s.candidate!),
      hide: ['currentStage', 'stageEnteredDate', 'nextEventDate', 'rejectionReason', 'appliedDate'],
      extra: {
        columns: START_COLUMNS,
        values: (c: Candidate) => {
          const s = byCand.get(c)!
          return { ...extra(s), startDate: s.startDate, [PERSON_KEY]: s.employee?.employeeId ?? null }
        },
      },
      note: [
        o.note,
        left
          ? `${left} pre-hire ${left === 1 ? 'record has' : 'records have'} no accepted offer in Candidates, so ${left === 1 ? 'it is' : 'they are'} not listed.`
          : null,
      ]
        .filter(Boolean)
        .join(' '),
      uses: o.uses,
    })
  }
  const byEmp = new Map(starts.map((s) => [s.employee!, s]))
  return drillSpec({
    kind: 'employees',
    title,
    subtitle,
    rows: starts.map((s) => s.employee!),
    hide: ['tenure', 'directReports', 'orgSize'],
    extra: {
      columns: START_COLUMNS.filter((c) => c.key !== 'employeeId' && c.key !== 'location'),
      values: (e: Employee) => extra(byEmp.get(e)!),
    },
    note: o.note,
    uses: o.uses,
  })
}

/** Onboarding tasks with their effective due date and state (the checklist fills blank due dates). */
export function tasksDrill(
  b: OnboardingBase,
  tasks: readonly TaskView[],
  title: string,
  o: { subtitle?: string; note?: string; uses?: Uses } = {},
): DrillSpec<'onboardingTasks'> | null {
  if (!tasks.length) return null
  const byTask = new Map(tasks.map((t) => [t.task, t]))
  return drillSpec({
    kind: 'onboardingTasks',
    title,
    subtitle: o.subtitle ?? asOfSub(b),
    rows: tasks.map((t) => t.task),
    extra: {
      columns: [],
      values: (t: OnboardingTask) => {
        const v = byTask.get(t)!
        return { dueDate: v.due, state: v.state, owner: v.owner }
      },
    },
    note: o.note,
    uses: o.uses,
  })
}

export function employeesDrill(
  b: OnboardingBase,
  rows: readonly Employee[],
  title: string,
  o: { subtitle?: string; note?: string; uses?: Uses; extra?: DrillSpec<'employees'>['extra'] } = {},
): DrillSpec<'employees'> | null {
  if (!rows.length) return null
  return drillSpec({
    kind: 'employees',
    title,
    subtitle: o.subtitle ?? windowSub(b),
    rows,
    note: o.note,
    uses: o.uses,
    extra: o.extra,
  })
}

export function candidatesDrill(
  b: OnboardingBase,
  rows: readonly Candidate[],
  title: string,
  o: { subtitle?: string; note?: string; uses?: Uses; extra?: DrillSpec<'candidates'>['extra'] } = {},
): DrillSpec<'candidates'> | null {
  if (!rows.length) return null
  return drillSpec({
    kind: 'candidates',
    title,
    subtitle: o.subtitle ?? windowSub(b),
    rows,
    hide: ['nextEventDate', 'stageEnteredDate'],
    extra: o.extra ?? {
      columns: [C('hiredDate', 'Offer accepted', { format: 'date' }), C('location', 'Location')],
      values: (c: Candidate) => ({
        hiredDate: c.hiredDate ?? null,
        location: b.reqs.get(c.reqId)?.location ?? null,
      }),
    },
    note: o.note,
    uses: o.uses,
  })
}

export function reqsDrill(
  b: OnboardingBase,
  rows: readonly Requisition[],
  title: string,
  o: { subtitle?: string; note?: string; uses?: Uses; extra?: DrillSpec<'requisitions'>['extra'] } = {},
): DrillSpec<'requisitions'> | null {
  if (!rows.length) return null
  return drillSpec({
    kind: 'requisitions',
    title,
    subtitle: o.subtitle ?? asOfSub(b),
    rows,
    note: o.note,
    uses: o.uses,
    extra: o.extra,
  })
}

/** Plan lines, with what stands behind each one. */
export function planDrill(
  b: OnboardingBase,
  views: readonly PlanLineView[],
  title: string,
  o: { subtitle?: string; note?: string; uses?: Uses } = {},
): DrillSpec<'hiringPlan'> | null {
  if (!views.length) return null
  const byLine = new Map(views.map((v) => [v.line, v]))
  return drillSpec({
    kind: 'hiringPlan',
    title,
    subtitle: o.subtitle ?? asOfSub(b),
    rows: views.map((v) => v.line),
    extra: {
      columns: [C('coverage', 'Behind it')],
      values: (l) => {
        const v = byLine.get(l)
        return { coverage: v ? COVERAGE_LABEL[v.coverage] : null }
      },
    },
    note: o.note,
    uses: o.uses,
  })
}

export function learningDrill(
  b: OnboardingBase,
  items: readonly { record: LearningRecord; deadline: string; onTime: boolean; start: Start }[],
  title: string,
  o: { note?: string; uses?: Uses } = {},
): DrillSpec<'learning'> | null {
  if (!items.length) return null
  const by = new Map(items.map((x) => [x.record, x]))
  return drillSpec({
    kind: 'learning',
    title,
    subtitle: windowSub(b),
    rows: items.map((x) => x.record),
    extra: {
      columns: [
        C('startDate', 'Start date', { format: 'date' }),
        C('deadline', 'Allowed until', { format: 'date' }),
        C('onTime', 'On time'),
      ],
      values: (l) => {
        const x = by.get(l)!
        return { startDate: x.start.startDate, deadline: x.deadline, onTime: x.onTime ? 'Yes' : 'No' }
      },
    },
    note: o.note,
    uses: o.uses,
  })
}

export function transactionsDrill(
  b: OnboardingBase,
  rows: readonly HrTransaction[],
  title: string,
  o: { note?: string; uses?: Uses } = {},
): DrillSpec<'transactions'> | null {
  if (!rows.length) return null
  return drillSpec({ kind: 'transactions', title, subtitle: windowSub(b), rows, note: o.note, uses: o.uses })
}

/** Grouped survey results (never an answer or a respondent). */
export function surveyDrill(
  b: OnboardingBase,
  survey: SurveyType,
  groups: Breakdown | null,
  overall: SurveyAggregate | null,
  title: string,
  o: { groupBy: string; item?: string | null; driver?: string | null; uses?: Uses },
): DrillSpec<'surveyGroups'> | null {
  if (!overall?.respondents) return null
  const meta = { survey, groupBy: o.groupBy, item: o.item ?? null, driver: o.driver ?? null }
  const rows = [
    ...groupRows([{ group: 'All respondents', ...overall }], { ...meta, groupBy: 'All' }),
    ...(groups ? groupRows(groups, meta) : []),
  ]
  return drillSpec({
    kind: 'surveyGroups',
    title,
    subtitle: windowSub(b),
    rows,
    note: `Grouped results only. Groups under ${b.settings.surveyMin} respondents show counts without scores.`,
    uses: o.uses,
  })
}
