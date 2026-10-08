/**
 * The onboarding readout: findings across the three tabs, each with a number, where it
 * concentrates and one neutral next step (docs/VIEWS.md, Onboarding > Findings). Thresholds come
 * from the metric dictionary through the settings; wording follows the copy rules (sentence case,
 * no em dashes, units on numbers, no nagging verbs).
 */
import type { Finding, Severity } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import { formatDate } from '@/lib/dates'
import { type Dimension, decomposeRate } from '@/lib/decompose'
import { fmt, plural } from '@/lib/format'
import { aggregate, respondentIndex } from '@/lib/surveys'
import { M } from '../metrics'
import type { OnboardingBase } from './base'
import {
  candidatesDrill,
  employeesDrill,
  groupScope,
  planDrill,
  planYtdSub,
  reqsDrill,
  startsDrill,
  tasksDrill,
  windowSub,
  withScope,
} from './drills'
import type { First90Model } from './first90'
import {
  ACCEPTED,
  DEPARTMENT,
  OPEN_REQS,
  PLAN,
  PLAN_REQ,
  PULSE,
  RENEGE,
  SITE,
  STARTERS,
  TASK_OWNER,
  TASKS,
  TRAINING,
  UPCOMING,
  union,
} from './lineage'
import { isUncovered, type PlanModel } from './plan'
import { regionSites, type Start, type TaskView } from './starts'
import type { UpcomingModel } from './upcoming'

export const MAX_FINDINGS = 10

const RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2, good: 3 }

/** A finding with how much it matters, for ranking inside a severity. */
type Ranked = Finding & { impact: number }

const pct = (v: number | null | undefined) => fmt(v, 'pct')
const pct0 = (v: number | null | undefined) => fmt(v, 'pct0')

/** "a, b and c". */
export function joinAnd(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/** "3 in Bengaluru and 1 in Shanghai", largest first. */
function countsBy<T>(rows: readonly T[], key: (r: T) => string | null): string {
  const m = new Map<string, number>()
  for (const r of rows) {
    const k = key(r) ?? 'an unknown site'
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return joinAnd(
    [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, n]) => `${n} in ${k}`),
  )
}

/** How a late task reads in a sentence ("Laptops shipped late"), and what to review. */
const LATE_WORDS: Record<string, { late: string; review: string }> = {
  'Laptop shipped': { late: 'Laptops shipped late', review: 'laptop shipping lead times' },
  'Accounts created': { late: 'Accounts were created late', review: 'account set-up lead times' },
  'Badge ready': { late: 'Badges were ready late', review: 'badge lead times' },
  'Background check cleared': {
    late: 'Background checks cleared late',
    review: 'background check turnaround',
  },
  'Export-control screening': {
    late: 'Export-control screening finished late',
    review: 'export-control screening turnaround',
  },
  'Benefits packet sent': { late: 'Benefits packets went out late', review: 'benefits packet timing' },
  'Orientation booked': { late: 'Orientation was booked late', review: 'orientation booking' },
  'Manager welcome': { late: 'Manager welcomes came late', review: 'manager welcome timing' },
  'Day -1 readiness check': {
    late: 'Day -1 readiness checks ran late',
    review: 'the day -1 readiness check',
  },
  'I-9 Section 1': { late: 'I-9 Section 1 was late', review: 'I-9 Section 1 timing' },
}

/** The team that owns a task, as named in an action sentence. */
const TEAM_WORDS: Record<string, string> = {
  'People ops': 'People operations',
  IT: 'IT',
  Facilities: 'Facilities',
  'Trade compliance': 'Trade compliance',
  Manager: 'the hiring managers',
  'New hire': 'People operations',
  Recruiter: 'the recruiters',
  Payroll: 'Payroll',
}
export const teamWords = (owner: string): string => TEAM_WORDS[owner] ?? owner

/** "on 5 Oct 2026" when every start shares a date, else "by 14 Oct 2026". */
function whenWords(starts: readonly Start[]): string {
  const dates = [...new Set(starts.map((s) => s.startDate))].sort()
  return dates.length === 1 ? `on ${formatDate(dates[0])}` : `by ${formatDate(dates[dates.length - 1])}`
}

/* ───────────── upcoming starts ───────────── */

function contingencyFinding(b: OnboardingBase, u: UpcomingModel): Ranked | null {
  if (!u.contingencies.length) return null
  const uses = union(UPCOMING, TASKS)
  const withTask = (name: string) => u.contingencies.filter((x) => x.tasks.some((t) => t.name === name))
  const bgc = withTask('Background check cleared')
  const exp = withTask('Export-control screening')
  const [lead, leadTask, other, otherTask] =
    bgc.length >= exp.length
      ? [bgc, 'Background check cleared', exp, 'Export-control screening']
      : [exp, 'Export-control screening', bgc, 'Background check cleared']
  const starts = lead.map((x) => x.start)
  const n = starts.length
  const isBgc = leadTask === 'Background check cleared'
  const title = isBgc
    ? `${plural(n, 'person', 'people')} ${n === 1 ? 'starts' : 'start'} ${whenWords(starts)} without a cleared background check.`
    : `${plural(n, 'person', 'people')} ${n === 1 ? 'starts' : 'start'} ${whenWords(starts)} with export-control screening not done.`
  const otherStarts = other.map((x) => x.start)
  const blocked = other
    .flatMap((x) => x.tasks)
    .filter((t) => t.name === otherTask && t.state === 'Blocked').length
  const otherWords =
    otherTask === 'Export-control screening' ? 'export-control screening' : 'background check'
  const detail = other.length
    ? `${fmt(other.length, 'int')} more starting ${whenWords(otherStarts)} ${other.length === 1 ? 'has' : 'have'} ${other.length === 1 ? 'its' : 'their'} ${otherWords} ${blocked === other.length ? 'blocked' : 'open'}.`
    : undefined
  const due = lead
    .flatMap((x) => x.tasks)
    .filter((t) => t.name === leadTask && t.due)
    .map((t) => t.due!)
    .sort()[0]
  const team = isBgc ? 'People operations' : 'Trade compliance'
  const what = isBgc ? 'background checks' : 'export-control screenings'
  return {
    id: 'onboarding-contingencies',
    metricId: M.contingencies,
    severity: 'critical',
    title,
    detail,
    action: `Ask ${team} to confirm the ${what}${due ? ` before ${formatDate(due)}` : ''}.`,
    tab: 'upcoming',
    people: starts.map((s) => ({ id: s.key, name: s.name, note: s.location ?? undefined })),
    drill: () =>
      startsDrill(
        b,
        u.contingencies.map((x) => x.start),
        'Starts with an open background check or screening',
        { uses },
      ),
    uses,
    impact: 100 + u.contingencies.length,
  }
}

function notReadyFinding(b: OnboardingBase, u: UpcomingModel): Ranked | null {
  const behind = u.rows.filter((r) => r.readiness.status === 'Not ready' || r.readiness.status === 'Behind')
  if (!behind.length) return null
  const notReady = behind.filter((r) => r.readiness.status === 'Not ready')
  const owners = new Map<string, number>()
  for (const r of behind)
    if (r.readiness.blocking)
      owners.set(r.readiness.blocking.owner, (owners.get(r.readiness.blocking.owner) ?? 0) + 1)
  const top = [...owners.entries()].sort((a, c) => c[1] - a[1])[0]
  const uses = union(UPCOMING, TASKS, TASK_OWNER)
  return {
    id: 'onboarding-not-ready',
    metricId: M.readiness,
    severity: notReady.length ? 'critical' : 'warning',
    title: notReady.length
      ? `${plural(notReady.length, 'person', 'people')} ${notReady.length === 1 ? 'starts' : 'start'} within ${fmt(b.settings.notReadyDays, 'days')} with day-one tasks still open.`
      : `${plural(behind.length, 'upcoming start')} ${behind.length === 1 ? 'has' : 'have'} day-one tasks past due.`,
    detail: top
      ? `${teamWords(top[0])} owns the blocking item for ${fmt(top[1], 'int')} of them.`
      : undefined,
    action: top
      ? `Ask ${teamWords(top[0])} to confirm a date for each open item before the start.`
      : 'Confirm a date for each open item before the start.',
    tab: 'upcoming',
    drill: () =>
      startsDrill(
        b,
        behind.map((r) => r.start),
        'Upcoming starts behind on day-one tasks',
        { uses },
      ),
    uses,
    impact: 90 + behind.length,
  }
}

function renegeFinding(b: OnboardingBase, u: UpcomingModel): Ranked | null {
  const r = u.renege
  if (!r.reneged.length) return null
  const top = r.byLocation[0]
  if (!top || top.reneged.length < 2) return null
  const all = top.reneged.length === r.reneged.length
  const target = b.settings.targets.renege
  // Why someone reneged is cited only where the mode shows candidates' reasons (not Manager mode).
  const reasons =
    b.showsReasons === false
      ? []
      : [
          ...new Set(
            top.reneged
              .map((c) => (c.rejectionReason ?? '').replace(/^reneged:\s*/i, '').trim())
              .filter(Boolean),
          ),
        ]
  const lead = all
    ? r.reneged.length === 2
      ? 'Both reneges'
      : `All ${fmt(r.reneged.length, 'int')} reneges`
    : `${fmt(top.reneged.length, 'int')} of the ${fmt(r.reneged.length, 'int')} reneges`
  const company = r.accepted.length >= b.settings.minGroup ? r.rate : null
  const over = target && top.rate != null && top.rate >= target.value
  return {
    id: 'onboarding-renege-location',
    metricId: M.renege,
    severity: over ? 'warning' : 'info',
    title: `${lead} in the ${b.windowWords} were in ${top.location}: ${fmt(top.reneged.length, 'int')} of ${fmt(top.accepted.length, 'int')} accepted offers (${pct(top.rate)}).`,
    detail: [
      company != null
        ? `The renege rate is ${pct(company)} overall${target ? `, against a target under ${pct0(target.value)}` : ''}.`
        : null,
      reasons.length ? `Reasons given: ${joinAnd(reasons.map((x) => x.toLowerCase()))}.` : null,
    ]
      .filter(Boolean)
      .join(' '),
    action: `Keep in touch with ${top.location} hires through their notice period, with a monthly call from the hiring manager.`,
    tab: 'upcoming',
    // The site's reneges: "Filter to" shows the same count and rate for the site.
    drill: () =>
      withScope(
        candidatesDrill(b, top.reneged, `Reneges, ${top.location}`, { uses: RENEGE }),
        groupScope('location', top.location),
      ),
    uses: RENEGE,
    impact: top.reneged.length,
  }
}

/* ───────────── first 90 days ───────────── */

const dims: Dimension<{ start: Start }>[] = [
  { key: 'region', label: 'Region', get: (x) => x.start.region },
  { key: 'location', label: 'Location', get: (x) => x.start.location },
  { key: 'department', label: 'Department', get: (x) => x.start.department },
]

function lateTaskFinding(b: OnboardingBase, f: First90Model, ctx: AnalyticsContext): Ranked | null {
  const s = b.settings
  const byTask = new Map<string, { start: Start; task: TaskView; late: boolean }[]>()
  for (const x of f.readinessTasks) {
    if (x.task.state === 'Not needed') continue
    byTask.set(x.task.name, [...(byTask.get(x.task.name) ?? []), x])
  }
  let best: {
    task: string
    seg: ReturnType<typeof decomposeRate>[number]
    rows: typeof f.readinessTasks
  } | null = null
  for (const [task, rows] of byTask) {
    const segs = decomposeRate(rows, dims, (x) => x.late, {
      minDev: s.lateMinGap,
      minAffected: s.lateMinCount,
      minPopulation: s.minGroup,
    }).filter((g) => !g.small)
    const seg = segs[0]
    if (seg && (!best || seg.impact > best.seg.impact)) best = { task, seg, rows }
  }
  if (!best) return null
  const { task, seg, rows } = best
  const inSeg = rows.filter((x) => dims.find((d) => d.key === seg.dim)!.get(x) === seg.value)
  const late = inSeg.filter((x) => x.late)
  const words = LATE_WORDS[task] ?? { late: `"${task}" was late`, review: `"${task}" timing` }
  const owner = late[0]?.task.owner ?? inSeg[0]?.task.owner ?? ''
  const detail: string[] = [
    `${fmt(late.length, 'int')} of ${plural(inSeg.length, 'start')}, ${b.windowWords}.`,
  ]
  if (seg.dim === 'region') {
    const g = f.dayOne.byRegion.find((x) => x.group === seg.value)
    const rest = f.dayOne.judged.filter((p) => p.region !== seg.value)
    const restReady = rest.filter((p) => f.dayOne.ready.includes(p)).length
    if (g?.rate != null && rest.length >= s.minGroup)
      detail.push(
        `Day-one readiness there is ${pct0(g.rate)}, against ${pct0(restReady / rest.length)} elsewhere.`,
      )
    const pulse = f.pulse
    if (pulse.answers.length) {
      const who = respondentIndex({ employees: ctx.all.employees })
      const isHere = (key: string) => b.regions.regionOf(who(key).employee?.location) === seg.value
      const here = aggregate(
        pulse.answers.filter((r) => isHere(r.respondentKey)),
        { min: s.surveyMin },
      )
      const there = aggregate(
        pulse.answers.filter((r) => !isHere(r.respondentKey)),
        { min: s.surveyMin },
      )
      if (here.mean != null && there.mean != null)
        detail.push(
          `New starters there rate "I had what I needed" ${fmt(here.mean, 'num2')} of 5 at day 30, against ${fmt(there.mean, 'num2')} elsewhere.`,
        )
    }
  }
  const pulseShown = detail.some((d) => d.includes('I had what I needed'))
  const uses = union(STARTERS, TASKS, SITE, DEPARTMENT, ['employees.country'], pulseShown ? PULSE : [])
  // The segment as a scope: a site or a department as itself, a region as its sites, named as the
  // region ("Focus on APAC"). Starts follow their employee record, as the filters do.
  const sites = seg.dim === 'region' ? regionSites(b.regions, seg.value) : null
  const filter =
    seg.dim === 'location'
      ? groupScope('location', seg.value)
      : seg.dim === 'department'
        ? groupScope('department', seg.value)
        : sites
          ? { location: sites }
          : undefined
  const filterLabel = sites ? seg.value : undefined
  return {
    id: `onboarding-late-${task.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    metricId: M.lateTask,
    severity: 'warning',
    title: `${words.late} for ${pct(seg.segValue)} of ${seg.value} starts, against ${pct(seg.compValue)} elsewhere.`,
    detail: detail.join(' '),
    action: `Review ${words.review} for ${seg.value} with ${teamWords(owner)}.`,
    tab: 'first90',
    filter,
    filterLabel,
    // The late tasks of the segment's starts: "Filter to" keeps the same late tasks.
    drill: () =>
      withScope(
        tasksDrill(
          b,
          late.map((x) => x.task),
          `${task}, late, ${seg.value}`,
          { subtitle: windowSub(b), uses },
        ),
        filter,
        filterLabel,
      ),
    uses,
    impact: 50 + seg.impact * 100,
  }
}

function dayOneFinding(b: OnboardingBase, f: First90Model): Ranked | null {
  const d = f.dayOne
  const t = b.settings.targets.dayOne
  if (!t || d.rate == null || d.judged.length < b.settings.minGroup || d.rate >= t.value) return null
  const gap = b.settings.concentrationMinGap
  const worst = d.byRegion.find((g) => g.rate != null && g.met != null && !g.folded && g.n < d.judged.length)
  const restN = worst ? d.judged.length - worst.n : 0
  const restRate = worst && restN ? (d.ready.length - (worst.met ?? 0)) / restN : null
  const named = worst && worst.rate != null && restRate != null && restRate - worst.rate >= gap
  const notReady = d.judged.filter((p) => !d.ready.includes(p))
  const uses = union(STARTERS, TASKS, SITE)
  return {
    id: 'onboarding-day-one',
    metricId: M.dayOne,
    severity: d.rate < t.value - 0.1 ? 'critical' : 'warning',
    title: `Day-one readiness is ${pct0(d.rate)} against a ${pct0(t.value)} target: ${fmt(notReady.length, 'int')} of ${fmt(d.judged.length, 'int')} starts had a task open on their first day.`,
    detail: named
      ? `It is lowest in ${worst.group} at ${pct0(worst.rate)} (${fmt(worst.met, 'int')} of ${fmt(worst.n, 'int')}), against ${pct0(restRate)} elsewhere.`
      : undefined,
    action: 'Review the open day-one tasks with each owner team in the week before each start.',
    tab: 'first90',
    drill: () =>
      employeesDrill(b, notReady.map((p) => p.employee!).filter(Boolean), 'Starts not ready on day one', {
        uses,
      }),
    uses,
    impact: (t.value - d.rate) * 100,
  }
}

function checkInFinding(b: OnboardingBase, f: First90Model): Ranked | null {
  const c = f.checkIns
  const s = b.settings
  const t = s.targets.checkIns
  if (c.rate == null || c.judged.length < s.minGroup) return null
  const segs = decomposeRate(
    c.judged.map((x) => ({ start: x.person, x })),
    [{ key: 'department', label: 'Department', get: (r) => r.start.department }],
    (r) => !r.x.onTime,
    { minDev: s.concentrationMinGap, minAffected: s.minGroup, minPopulation: s.minGroup },
  ).filter((g) => !g.small)
  const seg = segs[0]
  const uses = union(STARTERS, TASKS, DEPARTMENT)
  if (!seg) {
    if (!t || c.rate >= t.value) return null
    const late = c.judged.filter((x) => !x.onTime)
    return {
      id: 'onboarding-check-ins',
      metricId: M.checkIns,
      severity: 'warning',
      title: `Check-ins were on time for ${pct0(c.rate)}, against a ${pct0(t.value)} target.`,
      action: 'Share the check-in schedule with managers of new starters and ask them to book the next ones.',
      tab: 'first90',
      drill: () =>
        tasksDrill(
          b,
          late.map((x) => x.task),
          'Check-ins late or missed',
          { subtitle: windowSub(b), uses },
        ),
      uses,
      impact: 10,
    }
  }
  const rows = c.judged.filter((x) => x.person.department === seg.value)
  const onTime = rows.filter((x) => x.onTime).length
  const missed = rows.filter((x) => !x.onTime && !x.task.task.completedDate && x.task.state !== 'Done').length
  const late = rows.length - onTime - missed
  return {
    id: 'onboarding-check-ins',
    metricId: M.concentration,
    severity: 'warning',
    title: `Check-ins in ${seg.value} were on time for ${pct0(onTime / rows.length)} (${fmt(onTime, 'int')} of ${fmt(rows.length, 'int')}), against ${pct0(1 - seg.compValue)} elsewhere.`,
    detail: `${fmt(missed, 'int')} were missed and ${fmt(late, 'int')} done late${t ? `. The target is ${pct0(t.value)} on time` : ''}.`,
    action: `Share the check-in schedule with the ${seg.value} managers and ask them to book the next ones.`,
    tab: 'first90',
    filter: { department: [seg.value] },
    drill: () =>
      withScope(
        tasksDrill(
          b,
          rows.map((x) => x.task),
          `Check-ins due, ${seg.value}`,
          { subtitle: windowSub(b), uses },
        ),
        groupScope('department', seg.value),
      ),
    uses,
    impact: 20 + seg.impact * 100,
  }
}

function probationFinding(b: OnboardingBase, f: First90Model): Ranked | null {
  const overdue = f.probation.filter((x) => x.state === 'Overdue')
  if (!overdue.length) return null
  const depts = [...new Set(overdue.map((x) => x.person.department))]
  const oldest = Math.max(...overdue.map((x) => x.daysLate))
  const n = overdue.length
  const uses = union(STARTERS, TASKS, DEPARTMENT, SITE, ['employees.terminationDate', 'employees.country'])
  return {
    id: 'onboarding-probation',
    metricId: M.probation,
    severity: 'warning',
    title: `${plural(n, 'probation decision')} ${n === 1 ? 'is' : 'are'} overdue${depts.length === 1 && depts[0] ? `, ${n === 1 ? 'in' : 'all in'} ${depts[0]}` : ''}.`,
    detail: `${countsBy(overdue, (x) => x.person.location)}. The oldest is ${fmt(oldest, 'days')} past due.`,
    action: 'Ask the managers to record each probation decision this week.',
    tab: 'first90',
    people: overdue.map((x) => ({
      id: x.person.key,
      name: x.person.name,
      note: `Due ${formatDate(x.due)}`,
    })),
    filter: depts.length === 1 && depts[0] ? { department: [depts[0]] } : undefined,
    drill: () =>
      tasksDrill(
        b,
        overdue.map((x) => x.task),
        'Probation decisions overdue',
        { uses },
      ),
    uses,
    impact: 30 + n,
  }
}

function i9Finding(b: OnboardingBase, f: First90Model): Ranked | null {
  const x = f.i9
  const t = b.settings.targets.i9
  if (!t || x.rate == null || x.judged.length < b.settings.minGroup || x.rate >= t.value) return null
  const uses = union(STARTERS, TASKS, SITE)
  return {
    id: 'onboarding-i9',
    metricId: M.i9,
    severity: 'warning',
    title: `I-9 Section 2 was late for ${fmt(x.late.length, 'int')} of ${plural(x.judged.length, 'US start')}: ${pct(x.rate)} on time against a ${pct0(t.value)} target.`,
    detail: `${countsBy(x.late, (i) => i.start.location)}.`,
    action: 'Review the late I-9s with People operations and confirm the Section 2 steps at each US site.',
    tab: 'first90',
    drill: () =>
      tasksDrill(
        b,
        x.late.map((i) => i.task),
        'I-9 Section 2 completed late',
        { subtitle: windowSub(b), uses },
      ),
    uses,
    impact: 25 + x.late.length,
  }
}

function trainingFinding(b: OnboardingBase, f: First90Model): Ranked | null {
  const x = f.training
  const t = b.settings.targets.training
  if (!t || x.rate == null || x.judged.length < b.settings.minGroup) return null
  const met = x.rate >= t.value
  return {
    id: 'onboarding-training',
    metricId: M.training,
    severity: met ? 'good' : 'warning',
    title: met
      ? `Required training in the first ${fmt(b.settings.trainingDays, 'days')} is on target: ${pct(x.rate)} done in time.`
      : `Required training in the first ${fmt(b.settings.trainingDays, 'days')} was done in time for ${pct(x.rate)}, against a ${pct0(t.value)} target.`,
    detail: `${fmt(x.judged.length - x.late.length, 'int')} of ${plural(x.judged.length, 'assignment')}, ${b.windowWords}.`,
    action: met ? undefined : 'Share the list of open courses with the managers of new starters.',
    tab: 'first90',
    drill: () =>
      employeesDrill(
        b,
        [...new Set((met ? x.judged : x.late).map((i) => i.start.employee!))].filter(Boolean),
        met ? 'New starters with required training' : 'New starters with training not done in time',
        { uses: TRAINING },
      ),
    uses: TRAINING,
    impact: met ? 1 : 15,
  }
}

function attritionFinding(b: OnboardingBase, f: First90Model): Ranked | null {
  const a = f.attrition
  const t = b.settings.targets.attrition90
  if (!t || a.rate == null || a.cohort.length < b.settings.minGroup || a.rate < t.value) return null
  const worst = a.byDepartment.find((g) => g.rate != null && !g.folded && (g.met ?? 0) > 0)
  const uses = union(STARTERS, [
    'employees.terminationDate',
    'employees.terminationType',
    'employees.department',
  ])
  return {
    id: 'onboarding-attrition-90',
    metricId: M.attrition90,
    severity: 'warning',
    title: `${pct(a.rate)} of starts resigned within ${fmt(b.settings.attritionDays, 'days')}, against a target under ${pct0(t.value)}.`,
    detail: worst
      ? `The highest rate is in ${worst.group}: ${fmt(worst.met, 'int')} of ${fmt(worst.n, 'int')}.`
      : undefined,
    action:
      b.showsReasons === false
        ? 'Check in with new starters during their first weeks, and talk with your HR business partner about early exits.'
        : 'Review the exit reasons of early leavers with their hiring managers.',
    tab: 'first90',
    drill: () => employeesDrill(b, a.leavers, 'Resigned in the early exit window', { uses }),
    uses,
    impact: 20,
  }
}

/* ───────────── hiring plan ───────────── */

function planFindings(b: OnboardingBase, p: PlanModel | null): Ranked[] {
  if (!p) return []
  const out: Ranked[] = []
  const s = b.settings
  const q = p.quarter
  for (const u of q.units) {
    if (u.uncovered < s.minBehind) continue
    const parts = [
      u.noReq ? `${plural(u.noReq, 'planned role')} ${u.noReq === 1 ? 'has' : 'have'} no req` : null,
      u.onHold ? `${fmt(u.onHold, 'int')} ${u.onHold === 1 ? 'sits on a req' : 'sit on reqs'} on hold` : null,
      u.cancelled
        ? `${fmt(u.cancelled, 'int')} ${u.cancelled === 1 ? 'sits on a cancelled req' : 'sit on cancelled reqs'}`
        : null,
    ].filter((x): x is string => !!x)
    const lines = u.lines.filter((v) => isUncovered(v.coverage))
    const depts = new Map<string, number>()
    for (const v of lines.filter((v2) => v2.coverage === 'no-req'))
      depts.set(v.line.department, (depts.get(v.line.department) ?? 0) + v.line.plannedHires)
    const topDept = [...depts.entries()].sort((a, c) => c[1] - a[1])[0]
    const unit = p.byUnit.find((r) => r.businessUnit === u.businessUnit)
    const detail = [
      `Its ${q.label} plan is ${plural(u.planned, 'start')}: ${fmt(u.accepted, 'int')} ${u.accepted === 1 ? 'has' : 'have'} an accepted offer and ${fmt(u.open, 'int')} an open req.`,
      topDept && topDept[1] > 1
        ? `${topDept[0]} has ${fmt(topDept[1], 'int')} of the roles with no req.`
        : null,
      unit?.status === 'Behind' && unit.vsPlan != null
        ? `Year to date it has ${fmt(unit.actualYtd, 'int')} of ${fmt(unit.planYtd, 'int')} planned starts (${pct0(unit.vsPlan)}).`
        : null,
    ].filter(Boolean)
    const uses = union(PLAN, PLAN_REQ, ACCEPTED)
    out.push({
      id: `onboarding-plan-behind-${u.businessUnit.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      metricId: M.quarter,
      severity: 'warning',
      title: `${u.businessUnit} is ${plural(u.uncovered, 'start')} behind its ${q.label} plan: ${joinAnd(parts)}.`,
      detail: detail.join(' '),
      action: `Review the open roles with the ${u.businessUnit} leaders and open the missing reqs.`,
      tab: 'plan',
      filter: { businessUnit: [u.businessUnit] },
      drill: () =>
        withScope(
          planDrill(b, lines, `${q.label} roles with no accepted offer or open req, ${u.businessUnit}`, {
            uses,
          }),
          groupScope('businessUnit', u.businessUnit),
        ),
      uses,
      impact: 60 + u.uncovered,
    })
  }
  // Units well off plan to date that the quarter finding doesn't cover.
  for (const r of p.byUnit) {
    if (r.status !== 'Ahead' && r.status !== 'Behind') continue
    if (out.some((x) => x.filter?.businessUnit?.[0] === r.businessUnit)) continue
    const uses = union(PLAN, ['employees.hireDate', 'employees.employmentType', 'employees.businessUnit'])
    out.push({
      id: `onboarding-plan-ytd-${r.businessUnit.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      metricId: M.vsPlan,
      severity: r.status === 'Behind' ? 'warning' : 'info',
      title: `${r.businessUnit} has ${fmt(r.actualYtd, 'int')} of ${fmt(r.planYtd, 'int')} planned starts to date (${pct0(r.vsPlan)}), ${r.status === 'Ahead' ? 'ahead of' : 'behind'} plan.`,
      action:
        r.status === 'Ahead'
          ? `Confirm with Finance whether the ${r.businessUnit} plan should be raised.`
          : `Review the ${r.businessUnit} hiring plan with its leaders.`,
      tab: 'plan',
      filter: { businessUnit: [r.businessUnit] },
      drill: () =>
        withScope(
          employeesDrill(b, r.actual, `Starts to date, ${r.businessUnit}`, {
            subtitle: planYtdSub(b, p),
            uses,
          }),
          groupScope('businessUnit', r.businessUnit),
        ),
      uses,
      impact: Math.abs((r.vsPlan ?? 1) - 1) * 10,
    })
  }
  const { added, backfills } = p.notInPlan
  const n = added.length + backfills.length
  if (n) {
    const uses = union(OPEN_REQS, ['hiringPlan.reqId', 'hiringPlan.planVersion', 'requisitions.reqType'])
    const deps = [...new Set(added.map((r) => r.department))]
    out.push({
      id: 'onboarding-not-in-plan',
      metricId: M.notInPlan,
      severity: 'info',
      title: `${plural(n, 'open req')} ${n === 1 ? 'is' : 'are'} not in the hiring plan${backfills.length ? `, ${fmt(backfills.length, 'int')} of them backfills` : ''}.`,
      detail: added.length
        ? `The other ${plural(added.length, 'req')} ${added.length === 1 ? 'is a new role' : 'are new roles'} opened outside the plan: ${joinAnd(deps)}.`
        : undefined,
      action: 'Confirm with Finance whether the new roles belong in the plan.',
      tab: 'plan',
      drill: () => reqsDrill(b, [...added, ...backfills], 'Open reqs not in the hiring plan', { uses }),
      uses,
      impact: n,
    })
  }
  return out
}

/** Every finding, ranked: severity, then impact; at most `MAX_FINDINGS`. */
export function onboardingFindings(
  b: OnboardingBase,
  u: UpcomingModel,
  f: First90Model,
  p: PlanModel | null,
  ctx: AnalyticsContext,
): Finding[] {
  const all = [
    contingencyFinding(b, u),
    notReadyFinding(b, u),
    renegeFinding(b, u),
    lateTaskFinding(b, f, ctx),
    dayOneFinding(b, f),
    checkInFinding(b, f),
    probationFinding(b, f),
    i9Finding(b, f),
    trainingFinding(b, f),
    attritionFinding(b, f),
    ...planFindings(b, p),
  ].filter((x): x is Ranked => !!x)
  return all
    .sort((a, c) => RANK[a.severity] - RANK[c.severity] || c.impact - a.impact)
    .slice(0, MAX_FINDINGS)
    .map(({ impact: _, ...x }) => x)
}
