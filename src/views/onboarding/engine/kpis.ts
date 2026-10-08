/**
 * The tiles of each tab. Every tile names its metric, the fields it reads, and the records behind
 * its value (and behind its change and note, when they hold a number).
 */
import type { Kpi } from '@/components/types'
import type { Candidate, Employee } from '@/data/schema'
import { asOfLine } from '@/drill/subtitle'
import { addDays, daysBetween, formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { isMaterialChange } from '@/lib/stats'
import { M } from '../metrics'
import type { OnboardingBase } from './base'
import {
  candidatesDrill,
  employeesDrill,
  gapNote,
  groupScope,
  learningDrill,
  planDrill,
  planYtdSub,
  reqsDrill,
  startsDrill,
  tasksDrill,
  windowSub,
  withScope,
} from './drills'
import type { First90Model } from './first90'
import { type ForecastModel, forecastWithin } from './forecast'
import {
  ACCEPT_TO_START,
  ACCEPTED,
  ACTUAL,
  ATTRITION_90,
  FORECAST,
  PLAN,
  PLAN_REQ,
  RENEGE,
  SITE,
  STARTERS,
  TASKS,
  TRAINING,
  UPCOMING,
  union,
} from './lineage'
import { isUncovered, type PlanModel } from './plan'
import { readyOnDayOne, type Start } from './starts'
import { type UpcomingModel, weekOf } from './upcoming'

const NO_TASKS = 'Upload Onboarding tasks to see this'
const NO_CANDIDATES = 'Upload Candidates with start dates to see this'

/** Upcoming starts per week for the next n weeks (the folder-tab and tile spark). */
export function weeklyStarts(starts: readonly Start[], asOf: string, n: number): number[] {
  const first = weekOf(addDays(asOf, 1))
  const out = new Array<number>(n).fill(0)
  for (const s of starts) {
    const i = Math.floor(daysBetween(first, weekOf(s.startDate)) / 7)
    if (i >= 0 && i < n) out[i]++
  }
  return out
}

/** A rate's change, colored only when material. */
function change(cur: number | null, prev: number | null, nCur: number, nPrev: number, min: number) {
  if (cur == null || prev == null) return { delta: null, deltaMaterial: false }
  return { delta: cur - prev, deltaMaterial: isMaterialChange(cur, prev, nCur, nPrev, min) }
}

export function upcomingKpis(b: OnboardingBase, u: UpcomingModel, hasStartData: boolean): Kpi[] {
  const s = b.settings
  const noData = !hasStartData
  const unknown = b.upcoming.unknownStart.length
  const weeks = Math.min(8, s.calendarWeeks)
  const out: Kpi[] = [
    {
      id: 'starts-30',
      metricId: M.starts,
      label: 'Starts in the next 30 days',
      value: noData ? null : u.in30.length,
      format: 'int',
      goodDirection: null,
      spark: noData ? undefined : weeklyStarts(b.upcoming.starts, b.asOf, weeks),
      note: noData
        ? NO_CANDIDATES
        : `60 d: ${fmt(u.in60.length, 'int')} · 90 d: ${fmt(u.in90.length, 'int')}${unknown ? ` · ${fmt(unknown, 'int')} start date unknown` : ''}`,
      tab: 'upcoming',
      drill: () => startsDrill(b, u.in30, 'Starts in the next 30 days', { uses: UPCOMING }),
      noteDrill: unknown
        ? () =>
            candidatesDrill(b, b.upcoming.unknownStart, 'Accepted offers with no start date', {
              note: 'Accepted recently, with no start date in Candidates and nobody in the roster yet.',
              uses: UPCOMING,
            })
        : () => startsDrill(b, u.in90, 'Starts in the next 90 days', { uses: UPCOMING }),
      uses: UPCOMING,
    },
  ]
  const taskUses = union(UPCOMING, TASKS)
  out.push({
    id: 'day-minus-3',
    metricId: M.dayMinus3,
    label: 'Day −3 tasks not done',
    value: b.hasTasks ? u.dayMinus3.length : null,
    format: 'int',
    goodDirection: 'down',
    note: b.hasTasks ? `Starts in the next ${fmt(s.dayMinus3Days, 'days')}` : NO_TASKS,
    tab: 'upcoming',
    drill: () =>
      startsDrill(
        b,
        u.dayMinus3.map((x) => x.start),
        'Starts with day −3 tasks not done',
        {
          subtitle: asOfLine(b.asOf, b.scopeLabel, `starts by ${formatDate(u.dayMinus3End)}`),
          uses: taskUses,
        },
      ),
    noteDrill: () =>
      tasksDrill(
        b,
        u.dayMinus3.flatMap((x) => x.tasks),
        'Open tasks due by day −3',
        { uses: taskUses },
      ),
    uses: taskUses,
  })
  const contStarts = u.contingencies.map((x) => x.start)
  out.push({
    id: 'contingencies',
    metricId: M.contingencies,
    label: 'Open contingencies',
    value: b.hasTasks ? u.contingencies.length : null,
    format: 'int',
    goodDirection: 'down',
    note: b.hasTasks ? `Starts by ${formatDate(u.contingencyEnd)}` : NO_TASKS,
    tab: 'upcoming',
    drill: () =>
      startsDrill(b, contStarts, 'Starts with an open background check or screening', { uses: taskUses }),
    noteDrill: () =>
      tasksDrill(
        b,
        u.contingencies.flatMap((x) => x.tasks),
        'Open background checks and export-control screenings',
        { uses: taskUses },
      ),
    uses: taskUses,
  })
  const ats = u.acceptToStart
  const longest = ats.byLocation.find((r) => r.days != null)
  const atsExtra = {
    columns: [
      { key: 'hiredDate', label: 'Offer accepted', format: 'date' as const },
      { key: 'location', label: 'Location' },
      { key: 'days', label: 'Days to start', format: 'days' as const },
    ],
    values: (c: Candidate) => ({
      hiredDate: c.hiredDate ?? null,
      location: b.reqs.get(c.reqId)?.location ?? null,
      days: c.hiredDate && c.startDate ? daysBetween(c.hiredDate, c.startDate) : null,
    }),
  }
  out.push({
    id: 'accept-to-start',
    metricId: M.acceptToStart,
    label: 'Offer accepted to start',
    value: ats.days,
    format: 'days',
    goodDirection: 'down',
    suppressed: ats.offers.length > 0 && ats.offers.length < s.minGroup,
    note: !b.hasCandidates
      ? NO_CANDIDATES
      : longest && ats.days != null
        ? `Median · longest in ${longest.location}, ${fmt(longest.days, 'days')}`
        : `Median · ${plural(ats.offers.length, 'accepted offer')}`,
    tab: 'upcoming',
    drill: () =>
      candidatesDrill(b, ats.offers, `Offers accepted, ${b.windowWords}`, {
        extra: atsExtra,
        uses: ACCEPT_TO_START,
      }),
    // The site named in the note, with the site as its filter.
    noteDrill: longest
      ? () =>
          withScope(
            candidatesDrill(b, longest.records, `Offers accepted, ${longest.location}`, {
              extra: atsExtra,
              uses: ACCEPT_TO_START,
            }),
            groupScope('location', longest.location),
          )
      : undefined,
    uses: ACCEPT_TO_START,
  })
  const r = u.renege
  const renegeExtra = {
    columns: [
      { key: 'hiredDate', label: 'Offer accepted', format: 'date' as const },
      { key: 'location', label: 'Location' },
    ],
    values: (c: Candidate) => ({
      hiredDate: c.hiredDate ?? null,
      location: b.reqs.get(c.reqId)?.location ?? null,
    }),
  }
  const tr = r.tracked
  out.push({
    id: 'renege',
    metricId: M.renege,
    label: 'Renege rate',
    value: r.accepted.length >= s.minGroup ? r.rate : null,
    format: 'pct',
    suppressed: r.accepted.length > 0 && r.accepted.length < s.minGroup,
    ...change(r.rate, r.prior.rate, r.accepted.length, r.prior.accepted.length, s.minGroup),
    deltaLabel: 'vs prior period',
    goodDirection: 'down',
    note: !b.hasCandidates
      ? NO_CANDIDATES
      : `${tr.country}: ${tr.accepted.length >= s.minGroup ? fmt(tr.rate, 'pct') : '—'} (${fmt(tr.reneged.length, 'int')} of ${fmt(tr.accepted.length, 'int')})`,
    tab: 'upcoming',
    drill: () =>
      candidatesDrill(b, r.accepted, `Offers accepted, ${b.windowWords}`, {
        note: 'Reneges show status Withdrawn.',
        extra: renegeExtra,
        uses: RENEGE,
      }),
    deltaDrill: () =>
      candidatesDrill(b, r.prior.accepted, 'Offers accepted, prior period', {
        subtitle: windowSub(b, b.prior),
        extra: renegeExtra,
        uses: RENEGE,
      }),
    noteDrill: () =>
      candidatesDrill(b, tr.accepted, `Offers accepted, ${tr.country}`, {
        note: 'Reneges show status Withdrawn.',
        extra: renegeExtra,
        uses: RENEGE,
      }),
    uses: RENEGE,
  })
  return out
}

const readyExtra = {
  columns: [{ key: 'readyOnDayOne', label: 'Ready on day one' }],
}

export function first90Kpis(b: OnboardingBase, f: First90Model): Kpi[] {
  const s = b.settings
  const min = s.minGroup
  const out: Kpi[] = []
  const d = f.dayOne
  const p = f.prior.dayOne
  const people = (list: readonly Start[]) => list.map((x) => x.employee!).filter(Boolean)
  const byEmp = new Map(d.judged.map((x) => [x.employee!, x]))
  const dayOneUses = union(STARTERS, TASKS)
  out.push({
    id: 'day-one',
    metricId: M.dayOne,
    label: 'Day-one readiness',
    value: d.judged.length >= min ? d.rate : null,
    format: 'pct',
    suppressed: d.judged.length > 0 && d.judged.length < min,
    ...change(d.rate, p.rate, d.judged.length, p.judged.length, min),
    deltaLabel: 'vs prior period',
    goodDirection: 'up',
    spark: d.byMonth.map((m) => m.rate),
    note: b.hasTasks
      ? `${fmt(d.ready.length, 'int')} of ${fmt(d.judged.length, 'int')} starts ready`
      : NO_TASKS,
    tab: 'first90',
    drill: () =>
      employeesDrill(b, people(d.judged), `Starts, ${b.windowWords}`, {
        extra: {
          ...readyExtra,
          values: (e: Employee) => ({ readyOnDayOne: readyOnDayOne(byEmp.get(e)!) ? 'Yes' : 'No' }),
        },
        uses: dayOneUses,
      }),
    deltaDrill: () =>
      employeesDrill(b, people(p.judged), 'Starts, prior period', {
        subtitle: windowSub(b, b.prior),
        uses: dayOneUses,
      }),
    noteDrill: d.ready.length
      ? () => employeesDrill(b, people(d.ready), `Ready on day one, ${b.windowWords}`, { uses: dayOneUses })
      : undefined,
    uses: dayOneUses,
  })
  const i9 = f.i9
  const i9Uses = union(STARTERS, TASKS, SITE)
  out.push({
    id: 'i9',
    metricId: M.i9,
    label: 'I-9 Section 2 on time',
    value: i9.judged.length >= min ? i9.rate : null,
    format: 'pct',
    suppressed: i9.judged.length > 0 && i9.judged.length < min,
    ...change(i9.rate, f.prior.i9.rate, i9.judged.length, f.prior.i9.judged.length, min),
    deltaLabel: 'vs prior period',
    goodDirection: 'up',
    note: b.hasTasks
      ? `${fmt(i9.late.length, 'int')} late of ${plural(i9.judged.length, 'US start')}`
      : NO_TASKS,
    tab: 'first90',
    drill: () =>
      tasksDrill(
        b,
        i9.judged.map((x) => x.task),
        `I-9 Section 2, US starts ${b.windowWords}`,
        { subtitle: windowSub(b), uses: i9Uses },
      ),
    noteDrill: i9.late.length
      ? () =>
          tasksDrill(
            b,
            i9.late.map((x) => x.task),
            'I-9 Section 2 completed late',
            { subtitle: windowSub(b), uses: i9Uses },
          )
      : undefined,
    uses: i9Uses,
  })
  const t = f.training
  out.push({
    id: 'training',
    metricId: M.training,
    label: `Required training within ${fmt(s.trainingDays, 'days')}`,
    value: t.judged.length >= min ? t.rate : null,
    format: 'pct',
    suppressed: t.judged.length > 0 && t.judged.length < min,
    goodDirection: 'up',
    note: `${fmt(t.late.length, 'int')} late of ${plural(t.judged.length, 'assignment')}`,
    tab: 'first90',
    drill: () =>
      learningDrill(b, t.judged, `Required training of new starters, ${b.windowWords}`, { uses: TRAINING }),
    noteDrill: t.late.length
      ? () => learningDrill(b, t.late, 'Required training not done in time', { uses: TRAINING })
      : undefined,
    uses: TRAINING,
  })
  const c = f.checkIns
  const ciUses = union(STARTERS, TASKS)
  const ciLate = c.judged.filter((x) => !x.onTime)
  out.push({
    id: 'check-ins',
    metricId: M.checkIns,
    label: 'Check-ins on time',
    value: c.judged.length >= min ? c.rate : null,
    format: 'pct',
    suppressed: c.judged.length > 0 && c.judged.length < min,
    goodDirection: 'up',
    note: b.hasTasks
      ? `${fmt(ciLate.length, 'int')} late or missed of ${fmt(c.judged.length, 'int')}`
      : NO_TASKS,
    tab: 'first90',
    drill: () =>
      tasksDrill(
        b,
        c.judged.map((x) => x.task),
        `30, 60 and 90-day check-ins due ${b.windowWords}`,
        { subtitle: windowSub(b), uses: ciUses },
      ),
    noteDrill: ciLate.length
      ? () =>
          tasksDrill(
            b,
            ciLate.map((x) => x.task),
            'Check-ins late or missed',
            { subtitle: windowSub(b), uses: ciUses },
          )
      : undefined,
    uses: ciUses,
  })
  const overdue = f.probation.filter((x) => x.state === 'Overdue')
  const soon = f.probation.filter((x) => x.state === 'Due soon')
  const probUses = union(STARTERS, TASKS, ['employees.terminationDate', 'employees.country'])
  out.push({
    id: 'probation',
    metricId: M.probation,
    label: 'Probation decisions overdue',
    value: b.hasTasks ? overdue.length : null,
    format: 'int',
    goodDirection: 'down',
    note: b.hasTasks
      ? `${fmt(soon.length, 'int')} due in the next ${fmt(s.probationDueSoonDays, 'days')}`
      : NO_TASKS,
    tab: 'first90',
    drill: () =>
      tasksDrill(
        b,
        overdue.map((x) => x.task),
        'Probation decisions overdue',
        { uses: probUses },
      ),
    noteDrill: soon.length
      ? () =>
          tasksDrill(
            b,
            soon.map((x) => x.task),
            'Probation decisions due soon',
            { uses: probUses },
          )
      : undefined,
    uses: probUses,
  })
  const a = f.attrition
  const pa = f.prior.attrition
  const leftIds = new Set(a.leavers)
  out.push({
    id: 'attrition-90',
    metricId: M.attrition90,
    label: `Voluntary attrition within ${fmt(s.attritionDays, 'days')}`,
    value: a.cohort.length >= min ? a.rate : null,
    format: 'pct',
    suppressed: a.cohort.length > 0 && a.cohort.length < min,
    ...change(a.rate, pa.rate, a.cohort.length, pa.cohort.length, min),
    deltaLabel: 'vs prior period',
    goodDirection: 'down',
    note: `${fmt(a.leavers.length, 'int')} of ${plural(a.cohort.length, 'start')}`,
    tab: 'first90',
    drill: () =>
      employeesDrill(b, a.cohort, `Starts whose first ${fmt(s.attritionDays, 'days')} have passed`, {
        extra: {
          columns: [{ key: 'leftEarly', label: 'Resigned in the window' }],
          values: (e: Employee) => ({ leftEarly: leftIds.has(e) ? 'Yes' : 'No' }),
        },
        uses: ATTRITION_90,
      }),
    deltaDrill: () =>
      employeesDrill(b, pa.cohort, 'Starts, prior period', {
        subtitle: windowSub(b, b.prior),
        uses: ATTRITION_90,
      }),
    // "0 of 186 starts" still opens its records: the starts, none of whom resigned early.
    noteDrill: a.leavers.length
      ? () => employeesDrill(b, a.leavers, 'Resigned in the early exit window', { uses: ATTRITION_90 })
      : a.cohort.length
        ? () =>
            employeesDrill(b, a.cohort, `Starts whose first ${fmt(s.attritionDays, 'days')} have passed`, {
              note: 'None of them resigned in the early exit window.',
              uses: ATTRITION_90,
            })
        : undefined,
    uses: ATTRITION_90,
  })
  return out
}

export function planKpis(b: OnboardingBase, p: PlanModel | null, fc: ForecastModel | null): Kpi[] {
  const none = 'Upload a Hiring plan to see this'
  if (!p)
    return [
      {
        id: 'vs-plan',
        metricId: M.vsPlan,
        label: 'Starts vs plan',
        value: null,
        format: 'pct',
        note: none,
        uses: PLAN,
      },
      {
        id: 'committed',
        metricId: M.committed,
        label: 'Committed starts',
        value: null,
        format: 'int',
        note: none,
        uses: PLAN,
      },
      {
        id: 'gap',
        metricId: M.gap,
        label: 'Gap to plan',
        value: null,
        format: 'int',
        note: none,
        uses: PLAN,
      },
    ]
  const ytdLines = p.views.filter((v) => v.line.period <= p.toDate)
  const versionNote = p.version ? `${p.version}` : 'Plan'
  const from = addDays(b.asOf, 1)
  const fcReqs = (fc?.reqs ?? []).filter((r) => forecastWithin(r, from, p.end) > 0)
  const forecast = fcReqs.reduce((s, r) => s + forecastWithin(r, from, p.end), 0)
  const gap = p.planFull - (p.actual.length + p.committed.length + forecast)
  const uncovered = p.quarter.units.reduce((s, u) => s + u.uncovered, 0)
  const qLines = p.quarter.units.flatMap((u) => u.lines.filter((v) => isUncovered(v.coverage)))
  const planUses = union(PLAN, ACTUAL)
  const fcExtra = {
    columns: [{ key: 'expected', label: 'Expected starts', format: 'num2' as const }],
    values: (r: { reqId: string }) => ({
      expected: forecastWithin(fcReqs.find((x) => x.req.reqId === r.reqId)!, from, p.end),
    }),
  }
  return [
    {
      id: 'vs-plan',
      metricId: M.vsPlan,
      label: 'Starts vs plan, year to date',
      value: p.vsPlan,
      format: 'pct',
      goodDirection: null,
      note: `${fmt(p.actual.length, 'int')} of ${fmt(p.planYtd, 'int')} planned · ${p.status ?? 'No plan to date'}`,
      tab: 'plan',
      drill: () =>
        employeesDrill(b, p.actual, `Starts since ${formatDate(p.start)}`, {
          subtitle: planYtdSub(b, p),
          uses: planUses,
        }),
      noteDrill: () =>
        planDrill(b, ytdLines, `Planned starts to date, ${versionNote}`, { uses: union(PLAN, PLAN_REQ) }),
      uses: planUses,
    },
    {
      id: 'committed',
      metricId: M.committed,
      label: 'Committed starts',
      value: p.committed.length,
      format: 'int',
      goodDirection: 'up',
      note: `To ${formatDate(p.end)}`,
      tab: 'plan',
      drill: () =>
        startsDrill(b, p.committed, 'Committed starts in the plan year', { uses: union(PLAN, UPCOMING) }),
      uses: union(PLAN, UPCOMING),
    },
    {
      id: 'forecast',
      metricId: M.forecast,
      label: 'Forecast starts',
      value: fc ? Math.round(forecast) : null,
      format: 'int',
      goodDirection: 'up',
      note: fc ? `From ${plural(fcReqs.length, 'open req')}` : 'Upload Requisitions to see this',
      tab: 'plan',
      drill: () =>
        reqsDrill(
          b,
          fcReqs.map((r) => r.req),
          'Open reqs behind the forecast',
          { extra: fcExtra, uses: union(PLAN, FORECAST) },
        ),
      uses: union(PLAN, FORECAST),
    },
    {
      id: 'gap',
      metricId: M.gap,
      label: 'Gap to plan',
      value: fc ? Math.round(gap) : null,
      format: 'int',
      goodDirection: 'down',
      note: `Of ${fmt(p.planFull, 'int')} planned for the year`,
      tab: 'plan',
      // The gap is what is left to find: the records behind it are the future plan lines with
      // nothing behind them yet (no accepted offer, no open req), with the sum in the note.
      drill: () =>
        planDrill(b, p.noReq.length ? p.noReq : p.views, `Plan lines still to cover, ${versionNote}`, {
          note: gapNote(p.planFull, p.actual.length, p.committed.length, forecast, p.noReq.length > 0),
          uses: union(PLAN, PLAN_REQ, ACCEPTED),
        }),
      uses: union(PLAN, ACTUAL, UPCOMING, FORECAST),
    },
    {
      id: 'quarter-uncovered',
      metricId: M.quarter,
      label: `${p.quarter.label} roles not covered`,
      value: uncovered,
      format: 'int',
      goodDirection: 'down',
      note: 'No accepted offer or open req',
      tab: 'plan',
      drill: () =>
        planDrill(b, qLines, `${p.quarter.label} roles with no accepted offer or open req`, {
          uses: union(PLAN, PLAN_REQ, ACCEPTED),
        }),
      uses: union(PLAN, PLAN_REQ, ACCEPTED),
    },
  ]
}
