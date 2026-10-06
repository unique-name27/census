/**
 * The HRBP readout: rules ported from the earlier HRBP dashboard (engagement, pay and gender
 * rules dropped; flight risk and promotion readiness live in Talent), with the bugs fixed:
 * regretted exits are counted per manager (not all exits), growth compares true headcount at
 * both dates (not survivors), and every lookup is indexed.
 *
 * Each rule is a metric dictionary entry (`ID.*` in `../metrics`) whose thresholds are settings
 * read through `p.set`; the defaults are the thresholds of the earlier dashboard.
 */
import type { Finding, FindingPerson, Severity } from '@/components/types'
import type { Employee } from '@/data/schema'
import { employeeMatcher, focusLeader, scopeInSentence } from '@/data/scope'
import { groupFilter } from '@/drill/filter'
import { addDays, daysBetween, formatDate } from '@/lib/dates'
import { type Dimension, decomposeRate } from '@/lib/decompose'
import { fmt } from '@/lib/format'
import { inWindow, isActiveAt } from '@/lib/people'
import { ID } from '../metrics'
import {
  type AttritionModel,
  cohortSummary,
  exitsByDepartment,
  firstYearCohort,
  type GroupRateRow,
  groupOptions,
} from './attrition'
import {
  buildHistory,
  count,
  listJoin,
  nameList,
  type Prep,
  possessive,
  quoted,
  sentence,
  trailing,
} from './base'
import {
  employeesOnSpec,
  firstYearSpec,
  growthSpec,
  hiresSpec,
  layeredSpec,
  leaversSpec,
  managersSpec,
  periodName,
  rateNote,
  titled,
} from './drill'
import { type KpiModel, windowPhrase } from './kpis'
import {
  all,
  BUSINESS_UNIT,
  DEPARTMENT,
  DEPARTMENT_AT,
  FIRST_YEAR,
  HEADCOUNT,
  ifPresent,
  LEVEL,
  LEVEL_AT,
  type Lineage,
  LOCATION,
  MANAGER,
  MANAGER_SINCE,
  NONE,
  ORG,
  PAST_HEADCOUNT,
  REASON,
  VOLUNTARY,
} from './lineage'
import type { OrgModel } from './org'
import { exitsIn } from './population'
import type { WorkforceModel } from './workforce'

interface Ranked extends Finding {
  impact: number
}

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2, good: 3 }
/**
 * Everyone behind a finding's number is listed (the readout shows 5 and "and N more"), so the
 * people chip and the number agree. The cap only guards very large groups.
 */
export const MAX_PEOPLE = 100

const pct = (v: number) => fmt(v, 'pct')
const pts = (v: number) => `${fmt(Math.abs(v) * 100, 'num1')} pts`
/** A threshold in points, as few decimals as it needs: "3 pts", "2.5 pts". */
const ptsPlain = (v: number) => `${+(Math.abs(v) * 100).toFixed(1)} pts`
/** "a year" for the default first-year window, else "180 days". */
const firstYearPhrase = (p: Prep) =>
  p.set.firstYearDays === 365 ? 'a year' : count(p.set.firstYearDays, 'day', 'days')

/**
 * Exit reasons are cited (in details and people notes) only when their data meets the data
 * standard, so a bronze reason field never hides a finding whose number is confirmed.
 */
const citesReasons = (p: Prep): boolean => p.meets(REASON)
const reasonLineage = (p: Prep): Lineage => (citesReasons(p) ? ifPresent(REASON) : NONE)

function leaverNote(e: Employee, p: Prep): string {
  const parts = [`Left ${formatDate(e.terminationDate)}`]
  if (e.terminationReason && citesReasons(p)) parts.push(e.terminationReason)
  if (e.managerId) parts.push(`under ${p.name(e.managerId)}`)
  return parts.join(' · ')
}

const people = (list: readonly Employee[], note: (e: Employee) => string): FindingPerson[] =>
  list.slice(0, MAX_PEOPLE).map((e) => ({ id: e.employeeId, name: e.name, note: note(e) }))

function topReasons(list: readonly Employee[], n = 2): { reason: string; count: number }[] {
  const m = new Map<string, number>()
  for (const e of list)
    if (e.terminationReason) m.set(e.terminationReason, (m.get(e.terminationReason) ?? 0) + 1)
  return [...m.entries()]
    .map(([reason, c]) => ({ reason, count: c }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .slice(0, n)
}

/**
 * The next step on above-company voluntary attrition: review the top exit reasons with `who` when
 * the finding can cite them, else only the stay conversations, so it never points at reasons the
 * data standard keeps off the page.
 */
function stayAction(p: Prep, who: string, teams: string): string {
  return citesReasons(p)
    ? `Review the top exit reasons with ${who} and hold stay conversations in the most affected teams.`
    : `Hold stay conversations in ${teams}.`
}

function reasonClause(p: Prep, list: readonly Employee[]): string {
  if (!citesReasons(p)) return ''
  const top = topReasons(list).filter((r) => r.count >= 2)
  if (!top.length) return ''
  return `, most often ${listJoin(top.map((r) => `${quoted(r.reason)} (${r.count})`))}`
}

/* ───────── 1. regretted exits clustered under a manager ───────── */

function regrettedClusters(p: Prep): Ranked | null {
  const { minExits, criticalExits } = p.set.regrettedCluster
  if (!p.regrettedReady) return null
  const byMgr = new Map<string, Employee[]>()
  for (const e of exitsIn(p.emps, p.t12, p.counts)) {
    if (!p.isRegretted(e) || !e.managerId) continue
    const arr = byMgr.get(e.managerId)
    if (arr) arr.push(e)
    else byMgr.set(e.managerId, [e])
  }
  const teams = [...byMgr.entries()]
    .filter(([, list]) => list.length >= minExits)
    .map(([managerId, list]) => ({ managerId, name: p.name(managerId), list }))
    .sort((a, b) => b.list.length - a.list.length || a.name.localeCompare(b.name))
  if (!teams.length) return null
  const top = teams[0]
  const mgr = p.ctx.org.byId.get(top.managerId)
  const where = mgr ? ` (${mgr.department}, ${mgr.location})` : ''
  const reason = citesReasons(p) ? topReasons(top.list, 1)[0] : undefined
  const others = teams.slice(1)
  const dates = top.list.map((e) => e.terminationDate as string).sort()
  const detail = [
    reason && reason.count >= 2
      ? `The most common reason given was ${quoted(reason.reason)} (${reason.count} of ${top.list.length}).`
      : `They left between ${formatDate(dates[0])} and ${formatDate(dates.at(-1))}.`,
    others.length
      ? `${count(others.length, 'other manager', 'other managers')} also had ${minExits} or more: ${nameList(
          others.map((t) => `${t.name} (${t.list.length})`),
          4,
        )}.`
      : '',
  ]
    .filter(Boolean)
    .join(' ')
  return {
    id: 'hrbp-regretted-cluster',
    metricId: ID.regrettedCluster,
    severity: top.list.length >= criticalExits ? 'critical' : 'warning',
    title: `${possessive(top.name)} team${where} had ${top.list.length} regretted exits in the last 12 months`,
    detail,
    action: `Hold stay conversations with the rest of ${possessive(top.name)} team this month.`,
    // The people behind the headline number: this manager's regretted leavers.
    people: people(top.list, (e) => leaverNote(e, p)),
    drill: () =>
      leaversSpec(p, `Regretted leavers from ${possessive(top.name)} team, last 12 months`, top.list, {
        when: p.t12.label,
      }),
    filter: mgr ? { leaderId: top.managerId } : undefined,
    tab: 'attrition',
    uses: p.uses(p.lin.regrettedExits, MANAGER, reasonLineage(p), ifPresent(all(DEPARTMENT, LOCATION))),
    impact: top.list.length * 2,
  }
}

/* ───────── 2. voluntary attrition above the company ───────── */

/** Employees exposed to the window: hired by its end and still employed at its start. */
const exposed = (emps: readonly Employee[], p: Prep) =>
  emps.filter(
    (e) => e.hireDate <= p.window.end && (!e.terminationDate || e.terminationDate >= p.window.start),
  )

const isVolExit = (p: Prep) => (e: Employee) =>
  e.terminationType === 'Voluntary' && inWindow(e.terminationDate, p.window)

function concentration(
  p: Prep,
  list: readonly Employee[],
  dims: Dimension<Employee>[],
  total: number,
): string {
  // Dimensions in order of preference: the first one with a clear concentration wins.
  const rows = exposed(list, p)
  for (const dim of dims) {
    const seg = decomposeRate(rows, [dim], isVolExit(p), { minAffected: 3 })[0]
    if (!seg || seg.small || seg.affected >= total) continue
    const who = seg.dim === 'level' ? `${seg.value} employees account` : `${seg.value} accounts`
    return `${who} for ${seg.affected} of the ${total}.`
  }
  return ''
}

const DIMS: Record<'department' | 'location' | 'level' | 'businessUnit', Dimension<Employee>> = {
  department: { key: 'department', label: 'Department', get: (e) => e.department },
  location: { key: 'location', label: 'Location', get: (e) => e.location },
  level: { key: 'level', label: 'Level', get: (e) => e.level },
  businessUnit: { key: 'businessUnit', label: 'Business unit', get: (e) => e.businessUnit },
}

function attritionVsCompany(p: Prep, kpi: KpiModel, att: AttritionModel): Ranked[] {
  const { gap, minAvgHeadcount, minExits, criticalRatio, criticalExits } = p.set.voluntaryAbove
  const company = kpi.companyVol
  if (company == null || !p.has.terminationType) return []
  const out: Ranked[] = []
  const phrase = windowPhrase(p)
  const annualize = p.set.annualize

  if (!p.ctx.isCompany && kpi.vol.rate != null && kpi.vol.avgHeadcount >= minAvgHeadcount) {
    const diff = kpi.vol.rate - company
    const leavers = kpi.records.voluntary
    const vol = kpi.vol
    const drill = () =>
      leaversSpec(p, titled('Voluntary leavers', p.ctx.scopeLabel, periodName(p)), leavers, {
        note: rateNote(
          vol.events,
          ['voluntary exit', 'voluntary exits'],
          vol.avgHeadcount,
          p.window.months,
          annualize,
        ),
      })
    if (diff >= gap) {
      const conc = concentration(p, p.emps, [DIMS.department, DIMS.location, DIMS.level], leavers.length)
      out.push({
        id: 'hrbp-voluntary-scope',
        metricId: ID.voluntaryAbove,
        severity:
          kpi.vol.rate >= company * criticalRatio && leavers.length >= criticalExits ? 'critical' : 'warning',
        title: `Voluntary attrition in ${scopeInSentence(p.ctx.scopeLabel)} is ${pct(kpi.vol.rate)}, ${pts(diff)} above the company`,
        detail: [
          `${count(leavers.length, 'voluntary exit', 'voluntary exits')} in ${phrase}${reasonClause(p, leavers)}.`,
          conc,
        ]
          .filter(Boolean)
          .join(' '),
        action: focusLeader(p.ctx.filters)
          ? stayAction(
              p,
              p.name(focusLeader(p.ctx.filters) as string),
              `the most affected teams under ${p.name(focusLeader(p.ctx.filters) as string)}`,
            )
          : /^Whole company| · not /.test(p.ctx.scopeLabel)
            ? // A scope with exclusions reads as a place, not a name: "the leaders in the whole company except Sales".
              stayAction(
                p,
                `the leaders in ${scopeInSentence(p.ctx.scopeLabel)}`,
                `the most affected teams in ${scopeInSentence(p.ctx.scopeLabel)}`,
              )
            : stayAction(p, `the ${p.ctx.scopeLabel} leaders`, `the most affected ${p.ctx.scopeLabel} teams`),
        people: people(leavers, (e) => leaverNote(e, p)),
        drill,
        tab: 'attrition',
        uses: p.uses(
          VOLUNTARY,
          reasonLineage(p),
          ifPresent(DEPARTMENT),
          ifPresent(LOCATION),
          ifPresent(LEVEL),
        ),
        impact: diff * kpi.vol.avgHeadcount,
      })
    } else if (diff <= -gap) {
      out.push({
        id: 'hrbp-voluntary-good',
        metricId: ID.voluntaryAbove,
        severity: 'good',
        title: `Voluntary attrition in ${scopeInSentence(p.ctx.scopeLabel)} is ${pct(kpi.vol.rate)}, ${pts(diff)} below the company`,
        detail: `${count(leavers.length, 'voluntary exit', 'voluntary exits')} in ${phrase}, against ${pct(company)} for the company.`,
        action: 'Ask the leader what is working so other teams can learn from it.',
        drill,
        tab: 'attrition',
        uses: p.uses(VOLUNTARY),
        impact: 0,
      })
    }
  }

  /** The location flagged first; a department whose excess sits mostly there is judged on the rest. */
  let flaggedLocation: string | null = null
  /** The department's voluntary rate outside the flagged location, when that location holds a large share of its leavers. */
  const outsideFlagged = (dept: string, leavers: readonly Employee[]) => {
    if (!flaggedLocation) return undefined
    const loc = flaggedLocation
    const shared = leavers.filter((e) => e.location === loc).length
    if (shared < 3 || shared / leavers.length < 0.3) return undefined
    const rest = exitsByDepartment(
      p.emps.filter((e) => e.location !== loc),
      p.window,
      p.history.deptAt,
      groupOptions(p),
    ).get(dept)
    const rate = rest ? p.rate(rest.voluntary, rest.avgHeadcount, p.window) : null
    return { location: loc, rate, exits: rest?.voluntary ?? 0 }
  }

  const dimension = (rows: GroupRateRow[], key: 'location' | 'department') => {
    if (rows.filter((r) => r.avgHeadcount > 0).length < 2) return
    const hits = rows
      .filter(
        (r) =>
          r.voluntaryRate != null &&
          r.avgHeadcount >= minAvgHeadcount &&
          r.voluntary >= minExits &&
          r.voluntaryRate - company >= gap,
      )
      .map((r) => ({ ...r, excess: ((r.voluntaryRate as number) - company) * r.avgHeadcount }))
      .sort((a, b) => b.excess - a.excess)
    for (const top of hits) {
      const rate = top.voluntaryRate as number
      const list = p.emps.filter((e) => (key === 'location' ? e.location : e.department) === top.group)
      const leavers = exitsIn(list, p.window, p.counts).filter((e) => e.terminationType === 'Voluntary')
      const outside = key === 'department' ? outsideFlagged(top.group, leavers) : undefined
      // Explained by the flagged location: outside it the department sits within the gap (3 pts) of the company.
      if (outside && (outside.rate == null || outside.rate - company < gap)) continue
      const within = key === 'location' ? [DIMS.department, DIMS.level] : [DIMS.location, DIMS.level]
      const also = hits.filter((h) => h !== top).map((h) => h.group)
      const second =
        outside?.rate != null
          ? `Outside ${outside.location} it is ${pct(outside.rate)}, ${pts(outside.rate - company)} above the company.`
          : concentration(p, list, within, leavers.length) ||
            (also.length
              ? `${listJoin(also.slice(0, 3))} ${also.length === 1 ? 'is' : 'are'} also ${ptsPlain(gap)} or more above.`
              : '')
      const judged =
        outside?.rate != null ? { rate: outside.rate, n: outside.exits } : { rate, n: leavers.length }
      out.push({
        id: `hrbp-voluntary-${key}`,
        metricId: ID.voluntaryAbove,
        severity:
          judged.rate >= company * criticalRatio && judged.n >= criticalExits ? 'critical' : 'warning',
        title: `Voluntary attrition in ${top.group} is ${pct(rate)}, ${pts(rate - company)} above the company`,
        detail: [
          `${count(leavers.length, 'voluntary exit', 'voluntary exits')} in ${phrase}${reasonClause(p, leavers)}.`,
          second,
        ]
          .filter(Boolean)
          .join(' '),
        action: stayAction(p, `the ${top.group} leaders`, `the most affected ${top.group} teams`),
        people: people(leavers, (e) => leaverNote(e, p)),
        drill: () => {
          const spec = leaversSpec(p, titled('Voluntary leavers', top.group, periodName(p)), leavers, {
            note: rateNote(
              top.voluntary,
              ['voluntary exit', 'voluntary exits'],
              top.avgHeadcount,
              p.window.months,
              annualize,
            ),
          })
          // A site is today's site, as the filters read it; a department rate is rebuilt from the
          // departments people were in at each month end, so "Filter to" would not reproduce it.
          return key === 'location' ? { ...spec, filter: groupFilter('location', top.group) } : spec
        },
        filter: key === 'location' ? { location: [top.group] } : { department: [top.group] },
        tab: 'attrition',
        uses: p.uses(
          VOLUNTARY,
          key === 'location' ? LOCATION : DEPARTMENT_AT,
          reasonLineage(p),
          ifPresent(key === 'location' ? DEPARTMENT : LOCATION),
          ifPresent(LEVEL),
        ),
        impact: top.excess,
      })
      if (key === 'location') flaggedLocation = top.group
      return
    }
  }
  dimension(att.byLocation, 'location')
  dimension(att.byDepartment, 'department')
  return out
}

/* ───────── 3. first-year attrition ───────── */

/** " Sales accounts for 7 of the 10." when one group holds most of a list (2 or more, not all). */
function mostIn(list: readonly Employee[], dim: Dimension<Employee>): string {
  const counts = new Map<string, number>()
  for (const e of list) {
    const k = dim.get(e)
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
  return best && best[1] >= 2 && best[1] < list.length
    ? ` ${best[0]} accounts for ${best[1]} of the ${list.length}.`
    : ''
}

function firstYear(p: Prep, kpi: KpiModel): Ranked | null {
  const { threshold, minHires, minLeavers } = p.set.firstYearHigh
  if (!p.has.terminationDate) return null
  const minGroup = p.set.minGroup
  const fy = kpi.firstYear
  const range = `${formatDate(addDays(fy.from, 1))} to ${formatDate(fy.to)}`
  const measured = `Measured on people hired ${range} who left within ${firstYearPhrase(p)} of starting.`
  const cohort = firstYearCohort(p.emps, p.asOf, p.counts)
  if (fy.rate != null && fy.cohort >= minGroup && fy.rate > threshold) {
    const leavers = cohort.filter(p.leftFirstYear)
    const company = p.ctx.isCompany
      ? null
      : cohortSummary(p.companyEmps, p.asOf, { counts: p.counts, leftFirstYear: p.leftFirstYear, minGroup })
          .rate
    return {
      id: 'hrbp-first-year',
      metricId: ID.firstYearHigh,
      severity: 'warning',
      title: p.ctx.isCompany
        ? `First-year attrition is ${pct(fy.rate)} (${fy.leavers} of ${fy.cohort} hires)`
        : `First-year attrition in ${scopeInSentence(p.ctx.scopeLabel)} is ${pct(fy.rate)} (${fy.leavers} of ${fy.cohort} hires)${
            company != null ? `, against ${pct(company)} for the company` : ''
          }`,
      detail: `${measured}${mostIn(leavers, DIMS.department)}`,
      action: `Review onboarding and the first 90 days with the hiring managers in ${scopeInSentence(p.ctx.scopeLabel)}.`,
      people: people(leavers, (e) => leaverNote(e, p)),
      drill: () =>
        firstYearSpec(p, titled('Left within their first year', p.ctx.scopeLabel), leavers, {
          size: fy.cohort,
          from: addDays(fy.from, 1),
          to: fy.to,
        }),
      tab: 'attrition',
      uses: p.uses(FIRST_YEAR, ifPresent(DEPARTMENT)),
      impact: fy.leavers,
    }
  }
  const dims: {
    key: 'businessUnit' | 'department' | 'location'
    get: (e: Employee) => string
    lineage: Lineage
  }[] = [
    { key: 'businessUnit', get: (e) => e.businessUnit, lineage: BUSINESS_UNIT },
    { key: 'department', get: (e) => e.department, lineage: DEPARTMENT },
    { key: 'location', get: (e) => e.location, lineage: LOCATION },
  ]
  for (const dim of dims) {
    const groups = new Map<string, Employee[]>()
    for (const e of cohort) {
      const k = dim.get(e)
      if (!k) continue
      const arr = groups.get(k)
      if (arr) arr.push(e)
      else groups.set(k, [e])
    }
    if (groups.size < 2) continue
    const totalLeavers = cohort.filter(p.leftFirstYear).length
    const hits = [...groups.entries()]
      .map(([group, list]) => {
        const leavers = list.filter(p.leftFirstYear)
        const rest = cohort.length - list.length
        const restRate = rest > 0 ? (totalLeavers - leavers.length) / rest : null
        const excess = leavers.length - list.length * (fy.rate ?? 0)
        return { group, list, leavers, rate: leavers.length / list.length, restRate, excess }
      })
      .filter((g) => g.list.length >= minHires && g.leavers.length >= minLeavers && g.rate > threshold)
      .sort((a, b) => b.excess - a.excess)
    const top = hits[0]
    if (!top) continue
    const sub =
      dim.key === 'businessUnit'
        ? DIMS.department
        : dim.key === 'department'
          ? DIMS.location
          : DIMS.department
    const conc = mostIn(top.leavers, sub)
    return {
      id: 'hrbp-first-year',
      metricId: ID.firstYearHigh,
      severity: 'warning',
      title: `First-year attrition in ${top.group} is ${pct(top.rate)} (${top.leavers.length} of ${top.list.length} hires)${
        top.restRate != null ? `, against ${pct(top.restRate)} elsewhere` : ''
      }`,
      detail: `${measured}${conc}`,
      action: `Review onboarding and the first 90 days with the ${top.group} hiring managers.`,
      people: people(top.leavers, (e) => leaverNote(e, p)),
      // The cohort is grouped by today's unit, department or site, so "Filter to" keeps the rate.
      drill: () => ({
        ...firstYearSpec(
          p,
          titled('Left within their first year', top.group),
          top.leavers,
          { size: top.list.length, from: addDays(fy.from, 1), to: fy.to },
          `${top.group} · ${p.ctx.scopeLabel}`,
        ),
        filter: groupFilter(dim.key, top.group),
      }),
      filter: { [dim.key]: [top.group] },
      tab: 'attrition',
      uses: p.uses(FIRST_YEAR, dim.lineage, ifPresent(sub === DIMS.location ? LOCATION : DEPARTMENT)),
      impact: top.leavers.length,
    }
  }
  return null
}

/* ───────── 4-7. org design ───────── */

function spanOutliers(p: Prep, org: OrgModel): Ranked | null {
  const { wide: wideAt, narrow: narrowAt } = p.set.spanOutliers
  const wide = org.managers.filter((m) => m.directs >= wideAt)
  const narrow = org.managers.filter((m) => m.directs <= narrowAt)
  if (!wide.length && !narrow.length) return null
  const have = (n: number) => (n === 1 ? 'manager has' : 'managers have')
  const single = narrowAt === 1
  const wideWords = `${wideAt} or more direct reports`
  const narrowWords = single ? 'a single direct report' : `${narrowAt} or fewer direct reports`
  const title =
    wide.length && narrow.length
      ? `${wide.length} ${have(wide.length)} ${wideWords} and ${narrow.length} ${narrow.length === 1 ? 'has' : 'have'} ${single ? 'only one' : `${narrowAt} or fewer`}`
      : wide.length
        ? `${wide.length} ${have(wide.length)} ${wideWords}`
        : `${narrow.length} ${have(narrow.length)} ${narrowWords}`
  const sentences: string[] = []
  if (wide.length) {
    const items = wide.map((m, i) => (i === 0 ? `${m.name} has ${m.directs}` : `${m.name} ${m.directs}`))
    sentences.push(`${nameList(items, 5)}.`)
  }
  if (narrow.length)
    sentences.push(
      `${single ? 'Single-report layers' : `Managers with ${narrowWords}`}: ${nameList(
        narrow.map((m) => m.name),
        5,
      )}.`,
    )
  const layers = single ? 'single-report layers' : 'small teams'
  return {
    id: 'hrbp-span-outliers',
    metricId: ID.spanOutliers,
    severity: 'info',
    title,
    detail: sentences.join(' '),
    action:
      wide.length && narrow.length
        ? `Review whether the wide teams need a team lead and whether the ${layers} can be merged.`
        : wide.length
          ? 'Review whether each of these teams needs a team lead or a split.'
          : single
            ? 'Review whether each single-report layer is still needed or can be merged.'
            : 'Review whether each of these small teams is still needed or can be merged.',
    people: [...wide, ...narrow].slice(0, MAX_PEOPLE).map((m) => ({
      id: m.managerId,
      name: m.name,
      note: `${count(m.directs, 'direct report', 'direct reports')} · ${m.department}`,
    })),
    drill: () =>
      managersSpec(
        p,
        wide.length && narrow.length
          ? `Managers with ${wideWords} or ${single ? 'only one' : `${narrowAt} or fewer`}`
          : wide.length
            ? `Managers with ${wideWords}`
            : `Managers with ${narrowWords}`,
        [...wide, ...narrow],
      ),
    tab: 'org',
    uses: p.uses(ORG),
    impact: wide.length + narrow.length,
  }
}

function newManagers(p: Prep, org: OrgModel): Ranked | null {
  const { minTeam, warnTeam } = p.set.newManagers
  const list = org.managers.filter((m) => m.newManager && m.directs >= minTeam)
  if (!list.length) return null
  const top = list[0]
  const managed = Math.max(1, Math.round(daysBetween(top.managerSince, p.asOf) / 30.436875))
  const newMeans = `New means hired or promoted into a manager level in the last ${count(p.set.newManagerMonths, 'month', 'months')}.`
  const title =
    list.length === 1
      ? `${top.name} has managed for ${count(managed, 'month', 'months')} and leads ${top.directs} direct reports`
      : `${list.length} new managers lead teams of ${minTeam} or more, ${top.name} with ${top.directs} direct reports`
  const rest = list.slice(1)
  return {
    id: 'hrbp-new-managers',
    metricId: ID.newManagers,
    severity: list.some((m) => m.directs >= warnTeam) ? 'warning' : 'info',
    title,
    detail: [
      newMeans,
      rest.length
        ? `The others: ${nameList(
            rest.map((m) => `${m.name} (${m.directs})`),
            4,
          )}.`
        : '',
    ]
      .filter(Boolean)
      .join(' '),
    action: 'Set up a monthly check-in on team load with each of these managers for their first year.',
    people: list.slice(0, MAX_PEOPLE).map((m) => ({
      id: m.managerId,
      name: m.name,
      note: `${m.directs} direct reports · managing since ${formatDate(m.managerSince)}`,
    })),
    drill: () =>
      managersSpec(p, `New managers leading ${minTeam} or more direct reports`, list, {
        note: newMeans,
        extra: {
          columns: [{ key: 'managerSince', label: 'Managing since', format: 'date' }],
          values: (m) => ({ managerSince: m.managerSince }),
        },
      }),
    filter: top.directs >= warnTeam ? { leaderId: top.managerId } : undefined,
    tab: 'org',
    uses: p.uses(ORG, MANAGER_SINCE),
    impact: top.directs,
  }
}

function singleReportChains(p: Prep, org: OrgModel): Ranked | null {
  if (!org.chains.length) return null
  const [first, ...rest] = org.chains
  return {
    id: 'hrbp-single-report-chains',
    metricId: ID.chains,
    severity: 'warning',
    title:
      org.chains.length === 1
        ? `${first.manager} has a single direct report who leads ${first.below} people`
        : `${org.chains.length} managers have a single direct report who leads ${p.set.chainMinBelow} or more people`,
    detail: [
      `${possessive(first.manager)} only report, ${first.report}, has ${first.below} people below them.`,
      rest.length
        ? `Also: ${nameList(
            rest.map((c) => `${c.manager} (${c.below} below)`),
            4,
          )}.`
        : '',
    ]
      .filter(Boolean)
      .join(' '),
    action: 'Check whether each of these layers is still needed or whether the report could move up a level.',
    people: org.chains.slice(0, MAX_PEOPLE).map((c) => ({
      id: c.managerId,
      name: c.manager,
      note: `Only report: ${c.report} · ${c.below} people below`,
    })),
    drill: () => chainsSpec(p, org),
    tab: 'org',
    uses: p.uses(ORG),
    impact: first.below / 10,
  }
}

/** Managers whose only direct report leads 5 or more people (the setting), with that report and their reach. */
export function chainsSpec(p: Prep, org: OrgModel) {
  const chainBy = new Map(org.chains.map((c) => [c.managerId, c]))
  const managers = org.managers.filter((m) => chainBy.has(m.managerId))
  const title = `Managers with a single direct report who leads ${p.set.chainMinBelow} or more people`
  return managersSpec(p, title, managers, {
    extra: {
      columns: [
        { key: 'onlyReport', label: 'Only direct report', format: 'text' },
        { key: 'reportBelow', label: 'People below them', format: 'int' },
      ],
      values: (m) => {
        const c = chainBy.get(m.employee.employeeId)
        return { onlyReport: c?.report ?? null, reportBelow: c?.below ?? null }
      },
    },
  })
}

function orgDepth(p: Prep, org: OrgModel): Ranked | null {
  // The deep-chain layer is the Org chart's: people below it sit in a deep reporting chain.
  const { deepChain, warnLayers } = p.set.orgDepth
  const deep = org.deep.people
  if (!deep.length) return null
  return {
    id: 'hrbp-org-depth',
    metricId: ID.orgDepth,
    severity: org.deep.maxDepth + 1 >= warnLayers ? 'warning' : 'info',
    title: `${count(deep.length, 'person sits', 'people sit')} below layer ${deepChain} of ${scopeInSentence(p.ctx.scopeLabel)}`,
    detail: `Layer 1 is the top of the group. The deepest reporting chain has ${org.deep.maxDepth + 1} layers.`,
    action: `Map the reporting chains below layer ${deepChain} and look for layers that can be merged at the next reorganization.`,
    people: people(deep, (e) => `${e.jobTitle} · ${e.department}`),
    drill: () =>
      layeredSpec(
        p,
        titled(`People below layer ${deepChain}`, p.ctx.scopeLabel),
        deep,
        org.layerOf,
        `Layer 1 is the top of the group; these people sit on layer ${deepChain + 1} or deeper.`,
      ),
    tab: 'org',
    uses: p.uses(ORG),
    impact: deep.length / 10,
  }
}

/* ───────── 8-10. growth and new hires ───────── */

/**
 * Who was in the scope on `since`: the whole company, or, under an org filter, company employees
 * whose department, business unit and level on that date match it. The scoped roster holds
 * today's members only, so people who have since moved out of a filtered department would
 * otherwise drop out of the earlier headcount (the survivor bias the earlier tool had).
 */
function scopeAt(p: Prep, since: string): { people: readonly Employee[]; deptAt: (e: Employee) => string } {
  if (p.ctx.isCompany) return { people: p.emps, deptAt: (e) => p.history.deptAt(e, since) }
  const history = buildHistory(p.companyChanges)
  const unitOf = new Map<string, string>()
  for (const e of p.companyEmps)
    if (e.department && !unitOf.has(e.department)) unitOf.set(e.department, e.businessUnit)
  const inScope = employeeMatcher(p.ctx.filters, p.ctx.org)
  const people = p.companyEmps.filter((e) => {
    if (!isActiveAt(e, since)) return false
    const department = history.deptAt(e, since)
    return inScope({
      ...e,
      department,
      businessUnit: unitOf.get(department) ?? e.businessUnit,
      level: history.levelAt(e, since),
    })
  })
  return { people, deptAt: (e) => history.deptAt(e, since) }
}

/** Department headcount now vs 6 months ago, true headcount at both dates (department at each date from transfers). */
export function departmentGrowth(p: Prep): {
  dept: string
  now: number
  before: number
  growth: number
  /** The department's employees today (`now`). */
  people: Employee[]
  /** Who was in the department on the earlier date (`before`). */
  beforeIds: Set<string>
}[] {
  const since = addDays(trailing(p.asOf, 6).start, -1)
  const before = new Map<string, Set<string>>()
  const now = new Map<string, Employee[]>()
  const then = scopeAt(p, since)
  for (const e of then.people) {
    if (!isActiveAt(e, since)) continue
    const d = then.deptAt(e)
    const ids = before.get(d)
    if (ids) ids.add(e.employeeId)
    else before.set(d, new Set([e.employeeId]))
  }
  for (const e of p.emps) {
    if (!isActiveAt(e, p.asOf)) continue
    const arr = now.get(e.department)
    if (arr) arr.push(e)
    else now.set(e.department, [e])
  }
  return [...now.entries()]
    .map(([dept, people]) => {
      const beforeIds = before.get(dept) ?? new Set<string>()
      return { dept, now: people.length, before: beforeIds.size, people, beforeIds }
    })
    .filter((g) => g.before >= p.set.minGroup)
    .map((g) => ({ ...g, growth: (g.now - g.before) / g.before }))
    .sort((a, b) => b.growth - a.growth)
}

function rapidGrowth(p: Prep): Ranked | null {
  const threshold = p.set.rapidGrowth
  if (!p.has.terminationDate) return null
  const since = addDays(trailing(p.asOf, 6).start, -1)
  const grown = departmentGrowth(p).filter((g) => g.growth >= threshold)
  const top = grown[0]
  if (!top) return null
  const rest = grown.slice(1)
  return {
    id: 'hrbp-rapid-growth',
    metricId: ID.rapidGrowth,
    severity: 'info',
    title: `${top.dept} grew ${fmt(top.growth, 'pct0')} in 6 months, from ${top.before} to ${top.now} people`,
    detail: [
      `Headcount on ${formatDate(since)} against ${formatDate(p.asOf)}.`,
      rest.length
        ? `Also growing ${fmt(threshold, 'pct0')} or more: ${nameList(
            rest.map((g) => g.dept),
            4,
          )}.`
        : '',
    ]
      .filter(Boolean)
      .join(' '),
    action: `Check manager capacity and onboarding support in ${top.dept}.`,
    // Under a department filter the earlier roster is rebuilt as it stood then, so "Filter to"
    // keeps both headcounts.
    drill: () => ({
      ...employeesOnSpec(p, p.asOf, {
        title: `Employees in ${top.dept} on ${formatDate(p.asOf)}`,
        rows: top.people,
        note: `${top.before} people were in ${top.dept} on ${formatDate(since)}. The last column shows who joined since.`,
        extra: {
          columns: [{ key: 'joinedSince', label: `Joined since ${formatDate(since)}`, format: 'text' }],
          values: (e) => ({ joinedSince: top.beforeIds.has(e.employeeId) ? 'No' : 'Yes' }),
        },
      }),
      filter: groupFilter('department', top.dept),
    }),
    filter: { department: [top.dept] },
    tab: 'workforce',
    // Under an org filter, the earlier roster is rebuilt with each person's unit and level on that date.
    uses: p.uses(PAST_HEADCOUNT, DEPARTMENT_AT, p.ctx.isCompany ? NONE : all(BUSINESS_UNIT, LEVEL_AT)),
    impact: top.now - top.before,
  }
}

function newHireConcentration(p: Prep): Ranked | null {
  const { share, minTeam, warnShare } = p.set.newHires
  const since = trailing(p.asOf, 6).start
  const teams = new Map<string, { size: number; hires: Employee[] }>()
  for (const e of p.emps) {
    if (!isActiveAt(e, p.asOf) || !e.managerId) continue
    const t = teams.get(e.managerId) ?? { size: 0, hires: [] }
    t.size++
    if (e.hireDate >= since) t.hires.push(e)
    teams.set(e.managerId, t)
  }
  const flagged = [...teams.entries()]
    .filter(([, t]) => t.size >= minTeam && t.hires.length / t.size >= share)
    .map(([managerId, t]) => ({
      managerId,
      name: p.name(managerId),
      size: t.size,
      recent: t.hires.length,
      hires: t.hires,
      share: t.hires.length / t.size,
    }))
    .sort((a, b) => b.share - a.share || b.size - a.size)
  if (!flagged.length) return null
  const top = flagged[0]
  const list = flagged.map((t) => `${possessive(t.name)} team ${t.recent} of ${t.size}`)
  const atLeast =
    share === 0.5 ? 'at least half their people' : `at least ${fmt(share, 'pct0')} of their people`
  return {
    id: 'hrbp-new-hire-concentration',
    metricId: ID.newHires,
    severity: flagged.some((t) => t.share >= warnShare) ? 'warning' : 'info',
    title:
      flagged.length === 1
        ? `${top.recent} of ${possessive(top.name)} ${top.size} direct reports were hired in the last 6 months`
        : `${flagged.length} teams have ${atLeast} hired in the last 6 months`,
    detail: `New hires since ${formatDate(since)}: ${nameList(list, 5)}.`,
    action:
      "Pair each new hire with an experienced buddy and keep these managers' other commitments light this quarter.",
    people: flagged.slice(0, MAX_PEOPLE).map((t) => ({
      id: t.managerId,
      name: t.name,
      note: `${t.recent} of ${t.size} direct reports hired since ${formatDate(since)}`,
    })),
    drill: () =>
      hiresSpec(
        p,
        flagged.length === 1
          ? `Recent hires on ${possessive(top.name)} team`
          : share === 0.5
            ? 'Recent hires on teams that are at least half new'
            : `Recent hires on teams that are at least ${fmt(share, 'pct0')} new`,
        flagged.flatMap((t) => t.hires),
        {
          when: `Hired ${formatDate(since)} to ${formatDate(p.asOf)}`,
          note: `Direct reports hired in the last 6 months: ${nameList(
            flagged.map((t) => `${t.recent} of ${t.size} on ${possessive(t.name)} team`),
            5,
          )}.`,
        },
      ),
    tab: 'workforce',
    uses: p.uses(HEADCOUNT, MANAGER),
    impact: flagged.length,
  }
}

function unevenGrowth(p: Prep, wf: WorkforceModel): Ranked | null {
  const { minGrowth, minAdded } = p.set.unevenGrowth
  if (!p.has.terminationDate) return null
  const rows = wf.growth.filter((g) => g.growth != null)
  if (rows.length < 2) return null
  const top = rows[0]
  if ((top.growth ?? 0) < minGrowth || top.change < minAdded) return null
  const byBu = new Set(p.emps.map((e) => e.businessUnit)).size > 1
  const net = wf.growth.reduce((a, g) => a + g.change, 0)
  const where = p.ctx.isCompany ? 'the company' : scopeInSentence(p.ctx.scopeLabel)
  const rest = net - top.change
  const share =
    net > top.change
      ? `That is ${top.change} of the net ${net} people added across ${where}.`
      : `The rest of ${where} ${rest > 0 ? `grew by ${rest}` : rest < 0 ? `shrank by ${-rest}` : 'held flat'}.`
  const flat = rows.find((g) => g !== top && Math.abs(g.growth ?? 1) < 0.01 && g.now >= 20)
  return {
    id: 'hrbp-uneven-growth',
    metricId: ID.unevenGrowth,
    severity: 'info',
    title: `${top.group} grew ${pct(top.growth as number)} in 12 months, from ${top.yearAgo.toLocaleString('en-US')} to ${top.now.toLocaleString('en-US')} people`,
    detail: [share, flat ? `${flat.group} was flat at ${flat.now.toLocaleString('en-US')}.` : '']
      .filter(Boolean)
      .join(' '),
    action: `Check manager capacity and onboarding support in ${top.group}.`,
    drill: () => {
      const spec = growthSpec(p, top)
      // The growth rows are grouped by today's unit (or department), as the filters read them.
      return spec && { ...spec, filter: groupFilter(wf.growthBy, top.group) }
    },
    filter: byBu ? { businessUnit: [top.group] } : { department: [top.group] },
    tab: 'workforce',
    uses: p.uses(PAST_HEADCOUNT, BUSINESS_UNIT, byBu ? NONE : DEPARTMENT),
    impact: 0.5,
  }
}

/* ───────── assemble ───────── */

export function computeFindings(
  p: Prep,
  parts: { kpi: KpiModel; attrition: AttritionModel; org: OrgModel; workforce: WorkforceModel },
): Finding[] {
  if (!p.emps.length) return []
  const all: (Ranked | null)[] = [
    regrettedClusters(p),
    ...attritionVsCompany(p, parts.kpi, parts.attrition),
    firstYear(p, parts.kpi),
    spanOutliers(p, parts.org),
    newManagers(p, parts.org),
    singleReportChains(p, parts.org),
    orgDepth(p, parts.org),
    rapidGrowth(p),
    newHireConcentration(p),
    unevenGrowth(p, parts.workforce),
  ]
  return all
    .filter((f): f is Ranked => f != null)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.impact - a.impact)
    .map(({ impact: _impact, ...f }) => ({ ...f, title: sentence(f.title) }))
}
