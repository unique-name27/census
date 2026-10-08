/**
 * The first 90 days (docs/VIEWS.md, Onboarding > First 90 days): day-one readiness, Form I-9
 * Section 2, required training, check-ins, probation decisions, early voluntary attrition, new
 * hires entered on time by site, and the day-30 onboarding pulse.
 */
import type { AnalyticsContext } from '@/data/context'
import {
  type Employee,
  type HrTransaction,
  type ISODate,
  type JobChange,
  type LearningRecord,
  onboardingTaskByName,
  REGIONS,
  type SurveyResponse,
  type SurveyType,
} from '@/data/schema'
import { addBusinessDays, addDays, daysBetween, monthKey, monthsBetween } from '@/lib/dates'
import { isActiveAt, isEmployee } from '@/lib/people'
import {
  aggregate,
  type Breakdown,
  breakdown,
  driverOf,
  itemIndex,
  respondentIndex,
  respondentKey,
  type SurveyAggregate,
  targetOf,
} from '@/lib/surveys'
import type { OnboardingBase } from './base'
import { isLate, readyOnDayOne, type Start, startersIn, startOf, type TaskView } from './starts'

export const CHECK_INS: readonly string[] = ['30-day check-in', '60-day check-in', '90-day check-in']
export const PULSE_SURVEY: SurveyType = 'Onboarding pulse day 30'
/** The week-1 readiness driver of the day-30 pulse ("I had what I needed"). */
export const PULSE_DRIVER = 'Week-1 readiness'

const share = (n: number, d: number): number | null => (d > 0 ? n / d : null)

export interface RateGroup<T> {
  group: string
  n: number
  /** Rows that meet the measure; null when the group is under the anonymity minimum. */
  met: number | null
  /** met ÷ n, or null when n is under the anonymity minimum. */
  rate: number | null
  rows: T[]
  /** For "Other (k)": how many groups under the minimum were folded into it. */
  folded?: number
}

/**
 * Rates by group, lowest first. Groups under the anonymity minimum are folded into "Other (k)",
 * listed last; when that is still under the minimum it shows its size only (no count met, no rate).
 */
export function rateBy<T>(
  rows: readonly T[],
  key: (r: T) => string | null,
  met: (r: T) => boolean,
  min: number,
): RateGroup<T>[] {
  const by = new Map<string, T[]>()
  for (const r of rows) {
    const k = key(r) ?? 'Unknown'
    const list = by.get(k)
    if (list) list.push(r)
    else by.set(k, [r])
  }
  const group = (name: string, list: T[], folded?: number): RateGroup<T> => {
    const shown = list.length >= min
    const m = list.filter(met).length
    return {
      group: name,
      n: list.length,
      met: shown ? m : null,
      rate: shown ? m / list.length : null,
      rows: list,
      ...(folded ? { folded } : {}),
    }
  }
  const big: RateGroup<T>[] = []
  const small: T[] = []
  let folded = 0
  for (const [name, list] of by) {
    if (list.length >= min) big.push(group(name, list))
    else {
      small.push(...list)
      folded++
    }
  }
  big.sort((a, b) => (a.rate ?? 2) - (b.rate ?? 2) || b.n - a.n || a.group.localeCompare(b.group))
  return folded ? [...big, group(`Other (${folded})`, small, folded)] : big
}

/** The weighted rate of rows a chart folds together (BarList `other`). */
export function foldRate<T extends { n: number; met: number | null }>(rest: readonly T[]): number | null {
  let n = 0
  let met = 0
  for (const r of rest) {
    if (r.met == null) return null
    n += r.n
    met += r.met
  }
  return n ? met / n : null
}

/* ───────────── day-one readiness ───────────── */

export interface DayOneFacts {
  /** Starters in the window with readiness tasks. */
  judged: Start[]
  ready: Start[]
  rate: number | null
  byMonth: { month: string; n: number; ready: number; rate: number | null; rows: Start[] }[]
  byRegion: RateGroup<Start>[]
  bySite: RateGroup<Start>[]
}

function dayOne(
  b: OnboardingBase,
  starters: readonly Start[],
  w: { start: ISODate; end: ISODate },
): DayOneFacts {
  const min = b.settings.minGroup
  const judged = starters.filter((p) => readyOnDayOne(p) != null)
  const isReady = (p: Start) => readyOnDayOne(p) === true
  const ready = judged.filter(isReady)
  const months = monthsBetween(w.start, w.end)
  const byMonth = months.map((month) => {
    const rows = judged.filter((p) => monthKey(p.startDate) === month)
    const r = rows.filter(isReady).length
    return { month, n: rows.length, ready: r, rate: rows.length >= min ? r / rows.length : null, rows }
  })
  return {
    judged,
    ready,
    rate: share(ready.length, judged.length),
    byMonth,
    byRegion: rateBy(judged, (p) => p.region, isReady, min),
    bySite: rateBy(judged, (p) => p.location, isReady, min),
  }
}

/* ───────────── I-9 Section 2 ───────────── */

export interface I9Item {
  start: Start
  task: TaskView
  deadline: ISODate
  onTime: boolean
}

function i9(
  b: OnboardingBase,
  starters: readonly Start[],
): { judged: I9Item[]; late: I9Item[]; rate: number | null } {
  const judged: I9Item[] = []
  for (const p of starters) {
    if (!p.us) continue
    const task = p.tasks.find((t) => t.name === 'I-9 Section 2')
    if (!task || task.state === 'Not needed') continue
    const deadline = addBusinessDays(p.startDate, b.settings.i9BusinessDays)
    const done = task.task.completedDate
    if (!done && !(task.task.status === 'Done') && deadline >= b.asOf) continue
    const onTime = done ? done <= deadline : task.task.status === 'Done'
    judged.push({ start: p, task, deadline, onTime })
  }
  const late = judged.filter((x) => !x.onTime)
  return { judged, late, rate: share(judged.length - late.length, judged.length) }
}

/* ───────────── required training ───────────── */

export interface TrainingItem {
  start: Start
  record: LearningRecord
  deadline: ISODate
  onTime: boolean
}

function training(
  b: OnboardingBase,
  learning: readonly LearningRecord[],
): {
  judged: TrainingItem[]
  late: TrainingItem[]
  rate: number | null
} {
  const days = b.settings.trainingDays
  const starters = new Map(b.starters.map((p) => [p.key, p]))
  const judged: TrainingItem[] = []
  for (const l of learning) {
    if (!l.required) continue
    const p = starters.get(l.employeeId)
    if (!p) continue
    const deadline = addDays(p.startDate, days)
    // Assigned in the first weeks and meant to be done within them; later deadlines are Talent's.
    if (l.assignedDate < p.startDate || l.assignedDate > deadline) continue
    if (l.dueDate && l.dueDate > deadline) continue
    if (!l.completedDate && deadline >= b.asOf) continue
    judged.push({ start: p, record: l, deadline, onTime: !!l.completedDate && l.completedDate <= deadline })
  }
  const late = judged.filter((x) => !x.onTime)
  return { judged, late, rate: share(judged.length - late.length, judged.length) }
}

/* ───────────── check-ins ───────────── */

export interface CheckInItem {
  person: Start
  task: TaskView
  onTime: boolean
}

function checkIns(
  b: OnboardingBase,
  started: readonly Start[],
): {
  judged: CheckInItem[]
  rate: number | null
  byCheckIn: RateGroup<CheckInItem>[]
  byDepartment: RateGroup<CheckInItem>[]
} {
  const judged: CheckInItem[] = []
  for (const p of started) {
    for (const t of p.tasks) {
      if (!CHECK_INS.includes(t.name) || t.state === 'Not needed' || !t.due) continue
      if (t.due > b.asOf || t.due < b.window.start || t.due > b.window.end) continue
      const done = t.task.completedDate
      judged.push({ person: p, task: t, onTime: done ? done <= t.due : t.state === 'Done' })
    }
  }
  const min = b.settings.minGroup
  const met = (x: CheckInItem) => x.onTime
  return {
    judged,
    rate: share(judged.filter(met).length, judged.length),
    byCheckIn: rateBy(judged, (x) => x.task.name, met, min).sort(
      (a, c) => CHECK_INS.indexOf(a.group) - CHECK_INS.indexOf(c.group),
    ),
    byDepartment: rateBy(judged, (x) => x.person.department, met, min),
  }
}

/** Everyone in scope who has started (any start date) and has onboarding tasks. */
function startedPeople(b: OnboardingBase, employees: readonly Employee[]): Start[] {
  return employees
    .filter((e) => e.hireDate <= b.asOf && b.tasks.byEmployee.has(e.employeeId))
    .map((e) => startOf(b.src, e, null, e.hireDate))
}

/* ───────────── probation ───────────── */

export type ProbationState = 'Overdue' | 'Due soon'

export interface ProbationItem {
  person: Start
  task: TaskView
  due: ISODate
  state: ProbationState
  /** Days past due (positive) or until due (negative). */
  daysLate: number
}

function probation(b: OnboardingBase, started: readonly Start[]): ProbationItem[] {
  const soon = addDays(b.asOf, b.settings.probationDueSoonDays)
  const out: ProbationItem[] = []
  for (const p of started) {
    if (!p.employee || !isActiveAt(p.employee, b.asOf)) continue
    for (const t of p.tasks) {
      if (t.name !== 'Probation decision' || !t.open || !t.due || t.due > soon) continue
      out.push({
        person: p,
        task: t,
        due: t.due,
        state: t.due < b.asOf ? 'Overdue' : 'Due soon',
        daysLate: daysBetween(t.due, b.asOf),
      })
    }
  }
  return out.sort((a, c) => a.due.localeCompare(c.due) || a.person.name.localeCompare(c.person.name))
}

/* ───────────── early voluntary attrition ───────────── */

export interface AttritionFacts {
  /** Employees who started in the window and whose early exit window has passed. */
  cohort: Employee[]
  leavers: Employee[]
  rate: number | null
  byDepartment: RateGroup<Employee>[]
  byManager: (RateGroup<Employee> & { managerId: string | null })[]
}

/** The manager someone had when they started: the "from" side of their first later manager change. */
export function managerAtHire(e: Employee, changes: readonly JobChange[] | undefined): string | null {
  const first = (changes ?? [])
    .filter((c) => c.effectiveDate > e.hireDate && c.fromManagerId)
    .sort((a, c) => a.effectiveDate.localeCompare(c.effectiveDate))[0]
  return first?.fromManagerId ?? e.managerId ?? null
}

function attrition90(
  b: OnboardingBase,
  ctx: AnalyticsContext,
  w: { start: ISODate; end: ISODate },
): AttritionFacts {
  const days = b.settings.attritionDays
  const cohort = ctx.data.employees.filter(
    (e) =>
      isEmployee(e) && e.hireDate >= w.start && e.hireDate <= w.end && addDays(e.hireDate, days) <= b.asOf,
  )
  const left = (e: Employee) =>
    e.terminationType === 'Voluntary' &&
    !!e.terminationDate &&
    e.terminationDate <= b.asOf &&
    daysBetween(e.hireDate, e.terminationDate) <= days
  const leavers = cohort.filter(left)
  const changes = new Map<string, JobChange[]>()
  for (const c of ctx.data.jobChanges) {
    if (c.changeType !== 'Manager change') continue
    changes.set(c.employeeId, [...(changes.get(c.employeeId) ?? []), c])
  }
  const min = b.settings.minGroup
  const mgr = (e: Employee) => managerAtHire(e, changes.get(e.employeeId))
  return {
    cohort,
    leavers,
    rate: share(leavers.length, cohort.length),
    byDepartment: rateBy(cohort, (e) => e.department, left, min).sort(highestFirst),
    byManager: rateBy(cohort, (e) => mgr(e), left, min)
      .map((g) => {
        const id = g.folded || g.group === 'Unknown' ? null : g.group
        return { ...g, managerId: id, group: id ? (b.byId.get(id)?.name ?? id) : g.group }
      })
      .sort(highestFirst),
  }
}

/** Highest rate first, with "Other (k)" last. */
function highestFirst<T>(a: RateGroup<T>, c: RateGroup<T>): number {
  return (a.folded ? 1 : 0) - (c.folded ? 1 : 0) || (c.rate ?? -1) - (a.rate ?? -1) || c.n - a.n
}

/* ───────────── new hires entered by day -3 (Atlas ON-03) ───────────── */

export interface NewHireTx {
  tx: HrTransaction
  location: string
  onTime: boolean
}

function newHireEntered(
  b: OnboardingBase,
  ctx: AnalyticsContext,
): {
  judged: NewHireTx[]
  rate: number | null
  bySite: RateGroup<NewHireTx>[]
} {
  const judged: NewHireTx[] = []
  for (const t of ctx.data.transactions) {
    if (t.type !== 'New hire' || t.effectiveDate < b.window.start || t.effectiveDate > b.window.end) continue
    if (!t.dueDate || (!t.completedDate && t.dueDate >= b.asOf)) continue
    const location = b.byId.get(t.employeeId)?.location ?? 'Unknown'
    judged.push({ tx: t, location, onTime: !!t.completedDate && t.completedDate <= t.dueDate })
  }
  const met = (x: NewHireTx) => x.onTime
  return {
    judged,
    rate: share(judged.filter(met).length, judged.length),
    bySite: rateBy(judged, (x) => x.location, met, b.settings.minGroup),
  }
}

/* ───────────── day-30 pulse ───────────── */

export interface PulseFacts {
  /** The week-1 readiness item's answers in the window. */
  answers: SurveyResponse[]
  item: string | null
  overall: SurveyAggregate | null
  byRegion: Breakdown | null
  /** The Survey items target for the item, else the metric's target. */
  target: number | null
}

function pulse(b: OnboardingBase, ctx: AnalyticsContext): PulseFacts {
  const items = itemIndex(ctx.data.surveyItems)
  const all = ctx.data.surveyResponses.filter(
    (r) => r.survey === PULSE_SURVEY && r.responseDate >= b.window.start && r.responseDate <= b.window.end,
  )
  const ready = all.filter((r) => driverOf(r, items) === PULSE_DRIVER)
  const answers = ready.length ? ready : []
  const item = answers[0]?.item ?? null
  const min = b.settings.surveyMin
  if (!answers.length)
    return { answers, item, overall: null, byRegion: null, target: b.settings.targets.pulse?.value ?? null }
  const who = respondentIndex({ employees: ctx.all.employees })
  return {
    answers,
    item,
    overall: aggregate(answers, { min }),
    byRegion: breakdown(
      answers,
      respondentKey(who, (j) => b.regions.regionOf(j.employee?.location)),
      { min },
    ),
    target: (item ? targetOf(items, PULSE_SURVEY, item) : null) ?? b.settings.targets.pulse?.value ?? null,
  }
}

/* ───────────── the tab ───────────── */

export interface First90Model {
  dayOne: DayOneFacts
  /** The same measures over the prior window, for the tiles' change. */
  prior: { dayOne: DayOneFacts; i9: ReturnType<typeof i9>; attrition: AttritionFacts }
  /** Day-one tasks of starters in the window, for the late-task rule. */
  readinessTasks: { start: Start; task: TaskView; late: boolean }[]
  i9: ReturnType<typeof i9>
  training: ReturnType<typeof training>
  checkIns: ReturnType<typeof checkIns>
  probation: ProbationItem[]
  attrition: AttritionFacts
  newHire: ReturnType<typeof newHireEntered>
  pulse: PulseFacts
}

export function computeFirst90(b: OnboardingBase, ctx: AnalyticsContext): First90Model {
  const readiness = b.starters.flatMap((start) =>
    start.tasks.filter((t) => t.def?.readiness).map((task) => ({ start, task, late: isLate(task) })),
  )
  const started = startedPeople(b, ctx.data.employees)
  const priorStarters = startersIn(b.src, b.prior)
  return {
    dayOne: dayOne(b, b.starters, b.window),
    prior: {
      dayOne: dayOne(b, priorStarters, b.prior),
      i9: i9(b, priorStarters),
      attrition: attrition90(b, ctx, b.prior),
    },
    readinessTasks: readiness,
    i9: i9(b, b.starters),
    training: training(b, ctx.data.learning),
    checkIns: checkIns(b, started),
    probation: probation(b, started),
    attrition: attrition90(b, ctx, b.window),
    newHire: newHireEntered(b, ctx),
    pulse: pulse(b, ctx),
  }
}

/* ───────────── late day-one tasks by task and place ───────────── */

/** Regions in the order the heatmap shows them (the region index's names; others follow by name). */
export const REGION_ORDER: readonly string[] = REGIONS

/** One day-one task of one starter, as `First90Model.readinessTasks` holds it. */
export type ReadinessTask = First90Model['readinessTasks'][number]

export interface LateCell {
  task: string
  /** The region ("APAC") or site ("Bengaluru"). */
  place: string
  /** Starters with the task (not "Not needed"). */
  n: number
  /** Of these, done after the due date or still open past it; null under the anonymity minimum. */
  late: number | null
  /** late ÷ n; null under the anonymity minimum. */
  share: number | null
  /** The late tasks behind the cell; empty when it is hidden, so it never drills. */
  items: ReadinessTask[]
}

/**
 * The share of starters whose day-one task was late (finished after its due date, or still open
 * past it), by task and by region or site. Tasks marked not needed are left out. A cell with fewer
 * starters than the anonymity minimum shows its size only. Tasks run in checklist order.
 */
export function lateByTaskAndPlace(
  tasks: readonly ReadinessTask[],
  by: 'region' | 'site',
  minGroup: number,
): LateCell[] {
  const cells = new Map<string, { task: string; place: string; all: ReadinessTask[] }>()
  for (const x of tasks) {
    if (x.task.state === 'Not needed') continue
    const place = (by === 'region' ? x.start.region : x.start.location) ?? 'Unknown'
    const k = `${x.task.name}\u0001${place}`
    const c = cells.get(k)
    if (c) c.all.push(x)
    else cells.set(k, { task: x.task.name, place, all: [x] })
  }
  const order = [...onboardingTaskByName.keys()]
  const taskIdx = (t: string) => {
    const i = order.indexOf(t)
    return i < 0 ? order.length : i
  }
  const placeIdx = (p: string) => {
    const i = REGION_ORDER.indexOf(p)
    return i < 0 ? REGION_ORDER.length : i
  }
  return [...cells.values()]
    .map(({ task, place, all }) => {
      const shown = all.length >= minGroup
      const late = all.filter((x) => x.late)
      return {
        task,
        place,
        n: all.length,
        late: shown ? late.length : null,
        share: shown ? late.length / all.length : null,
        items: shown ? late : [],
      }
    })
    .sort(
      (a, b) =>
        taskIdx(a.task) - taskIdx(b.task) ||
        a.task.localeCompare(b.task) ||
        placeIdx(a.place) - placeIdx(b.place) ||
        a.place.localeCompare(b.place),
    )
}

/* ───────────── when day-one tasks were finished ───────────── */

export interface TaskTimingItem {
  item: ReadinessTask
  /** Completed date − start date in days; negative means before the first day. */
  days: number
  /** Finished after its due date. */
  late: boolean
}

export interface TaskTiming {
  task: string
  /** Starters with the task (not "Not needed"). */
  n: number
  /** The due day from the start (-3 for "Day -3"), from the checklist; null when it has none. */
  dueDay: number | null
  /** Completed tasks with their timing. */
  done: TaskTimingItem[]
  /** Tasks still open (not binned). */
  open: ReadinessTask[]
  late: number
  /** Late tasks finished after the first day. */
  lateAfterStart: number
  /** False when fewer starters than the anonymity minimum have the task: the chart is hidden. */
  shown: boolean
}

/**
 * When one day-one task was finished, in days from the start date, for starters in the window.
 * Open tasks are counted, not binned. Hidden (no timings) when fewer starters than the anonymity
 * minimum have the task.
 */
export function taskTiming(tasks: readonly ReadinessTask[], task: string, minGroup: number): TaskTiming {
  const mine = tasks.filter((x) => x.task.name === task && x.task.state !== 'Not needed')
  const shown = mine.length >= minGroup
  const def = onboardingTaskByName.get(task)
  const done: TaskTimingItem[] = []
  const open: ReadinessTask[] = []
  for (const x of mine) {
    const completed = x.task.task.completedDate
    if (completed) {
      const late = x.task.state === 'Done late'
      done.push({ item: x, days: daysBetween(x.start.startDate, completed), late })
    } else if (x.task.open) open.push(x)
  }
  return {
    task,
    n: mine.length,
    dueDay: def?.dueDay ?? null,
    done: shown ? done : [],
    open: shown ? open : [],
    late: shown ? done.filter((d) => d.late).length : 0,
    lateAfterStart: shown ? done.filter((d) => d.late && d.days > 0).length : 0,
    shown,
  }
}

/** The day-one tasks with any late instance, the most late first (the timing chart's choices). */
export function lateTaskNames(tasks: readonly ReadinessTask[]): string[] {
  const n = new Map<string, number>()
  for (const x of tasks) if (x.late) n.set(x.task.name, (n.get(x.task.name) ?? 0) + 1)
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t)
}
