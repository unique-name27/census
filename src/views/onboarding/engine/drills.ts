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
import { asOfLine, windowLine } from '@/drill/subtitle'
import { type DrillSpec, drillSpec } from '@/drill/types'
import { formatDate, monthEnd } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { type Breakdown, groupRows, type SurveyAggregate } from '@/lib/surveys'
import type { OnboardingBase } from './base'
import { COVERAGE_LABEL, type CoverageRow, type PlanLineView, type PlanModel } from './plan'
import { daysLateOf, type Readiness, readinessOf, type Start, type TaskView } from './starts'

type Uses = readonly FieldRef[] | undefined

/** "1 Oct 2025 – 30 Sep 2026 · Whole company". */
export const windowSub = (b: OnboardingBase, w: { start: string; end: string } = b.window): string =>
  windowLine(w, b.scopeLabel)

/** "As of 30 Sep 2026 · Whole company". */
export const asOfSub = (b: OnboardingBase): string => asOfLine(b.asOf, b.scopeLabel)

/** The plan year to date: "1 Apr 2026 – 30 Sep 2026 · Whole company" (starts counted against the plan). */
export const planYtdSub = (b: OnboardingBase, p: { start: string; toDate: string }): string =>
  windowSub(b, { start: p.start, end: p.toDate })

/** One calendar month: "1 Jun 2026 – 30 Jun 2026 · Whole company". */
export const monthSub = (b: OnboardingBase, month: string): string =>
  windowSub(b, { start: `${month}-01`, end: monthEnd(`${month}-01`) })

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
      // Each row is a person starting, though the record is their accepted offer.
      noun: ['start', 'starts'],
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
    noun: ['start', 'starts'],
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
        // Days late from the effective due date (the checklist fills blank ones); blank while
        // a task is open and not yet due.
        return {
          dueDate: v.due,
          state: v.state,
          owner: v.owner,
          daysLate: daysLateOf(t, v.due, v.state, b.asOf),
        }
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

/**
 * The tasks behind one start's "7 of 10 done": the day-one tasks only (`readiness: true`; I-9
 * tasks at US sites), so the panel lists exactly the tasks counted. Later tasks such as the 30,
 * 60 and 90-day check-ins are left out, and the note says so.
 */
export function dayOneTasksDrill(
  b: OnboardingBase,
  r: Readiness,
  name: string,
  o: { uses?: Uses } = {},
): DrillSpec<'onboardingTasks'> | null {
  return tasksDrill(b, r.tasks, `Day-one tasks, ${name}`, {
    note: `${r.done} of ${r.total} done. Only the tasks that count toward day one are listed; later tasks such as the 30, 60 and 90-day check-ins are not.`,
    uses: o.uses,
  })
}

/** The roster records of a list of starts (people who started have one; offers alone do not). */
export const startEmployees = (list: readonly Start[]): Employee[] =>
  list.flatMap((p) => (p.employee ? [p.employee] : []))

/**
 * A day-one readiness bar or point (a month, a site): the starts who were not ready on day one.
 * When everyone was ready (a 100% bar) it opens the starts who were, so every bar opens records.
 */
export function readinessDrill(
  b: OnboardingBase,
  rows: readonly Start[],
  ready: ReadonlySet<Start>,
  where: string,
  o: { subtitle?: string; uses?: Uses } = {},
): DrillSpec<'employees'> | null {
  const notReady = rows.filter((p) => !ready.has(p))
  return notReady.length
    ? employeesDrill(b, startEmployees(notReady), `Not ready on day one, ${where}`, o)
    : employeesDrill(b, startEmployees(rows), `Ready on day one, ${where}`, {
        ...o,
        note: 'Everyone here had every day-one task done by their first day.',
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

/**
 * Plan lines, with what stands behind each one. A line can plan more than one start, so when the
 * planned starts differ from the line count the subtitle says so ("102 planned starts"): the
 * number clicked is the planned starts, the panel counts lines.
 */
export function planDrill(
  b: OnboardingBase,
  views: readonly PlanLineView[],
  title: string,
  o: { subtitle?: string; note?: string; uses?: Uses } = {},
): DrillSpec<'hiringPlan'> | null {
  if (!views.length) return null
  const byLine = new Map(views.map((v) => [v.line, v]))
  const starts = views.reduce((n, v) => n + v.line.plannedHires, 0)
  const sub = o.subtitle ?? asOfSub(b)
  return drillSpec({
    kind: 'hiringPlan',
    title,
    subtitle: starts === views.length ? sub : `${plural(starts, 'planned start')} · ${sub}`,
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

/**
 * How a gap to plan is reached, for its drill: "Gap = 195 planned − (120 started + 30 committed +
 * 7.0 forecast) = 38." and what the listed lines are.
 */
export function gapNote(
  planned: number,
  started: number,
  committed: number,
  forecast: number,
  uncoveredListed: boolean,
): string {
  const gap = planned - (started + committed + forecast)
  return [
    `Gap = ${fmt(planned, 'int')} planned − (${fmt(started, 'int')} started + ${fmt(committed, 'int')} committed + ${fmt(forecast, 'num1')} forecast) = ${fmt(Math.round(gap), 'int')}.`,
    uncoveredListed
      ? 'Listed: the future plan lines with no accepted offer or open req.'
      : 'Every future plan line has an accepted offer or an open req, so all plan lines are listed.',
  ].join(' ')
}

/** The drills of one plan coverage row; null where the number is 0 (nothing to open). */
export interface CoverageDrills {
  planYtd: (() => DrillSpec<'hiringPlan'> | null) | null
  actualYtd: (() => DrillSpec<'employees'> | null) | null
  planFull: (() => DrillSpec<'hiringPlan'> | null) | null
  gap: (() => DrillSpec<'hiringPlan'> | null) | null
}

/**
 * The records behind one row of the plan coverage table (a business unit or a department).
 * Starts to date carry the plan year to date as their window, not the view's period. Planned
 * starts open their plan lines, with the planned-start total in the subtitle when a line plans
 * more than one. The gap opens the future lines with nothing behind them yet, or every line of
 * the row when each one is covered, with the sum in the note.
 */
export function coverageDrills(
  b: OnboardingBase,
  p: PlanModel,
  r: CoverageRow,
  where: string,
  uses: { plan: Uses; actual: Uses; gap: Uses },
): CoverageDrills {
  const lines = new Set(r.lines)
  const rowViews = p.views.filter((v) => lines.has(v.line))
  const open = p.noReq.filter((v) => lines.has(v.line))
  const gapLines = open.length ? open : rowViews
  return {
    planYtd: r.planYtd
      ? () =>
          planDrill(
            b,
            rowViews.filter((v) => v.line.period <= p.toDate),
            `Planned starts to date, ${where}`,
            { uses: uses.plan },
          )
      : null,
    actualYtd: r.actualYtd
      ? () =>
          employeesDrill(b, r.actual, `Starts to date, ${where}`, {
            subtitle: planYtdSub(b, p),
            uses: uses.actual,
          })
      : null,
    planFull: r.planFull ? () => planDrill(b, rowViews, `Plan lines, ${where}`, { uses: uses.plan }) : null,
    gap:
      Math.round(r.gap) > 0 && gapLines.length
        ? () =>
            planDrill(b, gapLines, `Plan lines still to cover, ${where}`, {
              note: gapNote(r.planFull, r.actualYtd, r.committed, r.forecast, open.length > 0),
              uses: uses.gap,
            })
        : null,
  }
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
