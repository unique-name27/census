/**
 * The HRBP readout: rules ported from the earlier HRBP dashboard (engagement, pay and gender
 * rules dropped; flight risk and promotion readiness live in Talent), with the bugs fixed:
 * regretted exits are counted per manager (not all exits), growth compares true headcount at
 * both dates (not survivors), and every lookup is indexed.
 */
import type { Finding, FindingPerson, Severity } from '@/components/types'
import type { Employee } from '@/data/schema'
import { addDays, daysBetween, formatDate } from '@/lib/dates'
import { type Dimension, decomposeRate } from '@/lib/decompose'
import { fmt } from '@/lib/format'
import { exitsIn, inWindow, isActiveAt } from '@/lib/people'
import { type AttritionModel, cohortSummary, firstYearCohort, type GroupRateRow } from './attrition'
import { listJoin, nameList, type Prep, possessive, trailing } from './base'
import { type KpiModel, windowPhrase } from './kpis'
import type { OrgModel } from './org'
import { leftInFirstYear } from './rates'
import type { WorkforceModel } from './workforce'

interface Ranked extends Finding {
  impact: number
}

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2, good: 3 }
const MAX_PEOPLE = 50

const pct = (v: number) => fmt(v, 'pct')
const pts = (v: number) => `${fmt(Math.abs(v) * 100, 'num1')} pts`
const count = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

function leaverNote(e: Employee, p: Prep): string {
  const parts = [`Left ${formatDate(e.terminationDate)}`]
  if (e.terminationReason) parts.push(e.terminationReason)
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

function reasonClause(list: readonly Employee[]): string {
  const top = topReasons(list).filter((r) => r.count >= 2)
  if (!top.length) return ''
  return `, most often ${listJoin(top.map((r) => `${r.reason} (${r.count})`))}`
}

/* ───────── 1. regretted exits clustered under a manager ───────── */

function regrettedClusters(p: Prep): Ranked | null {
  if (!p.has.terminationType || !p.has.regrettable) return null
  const byMgr = new Map<string, Employee[]>()
  for (const e of exitsIn(p.emps, p.t12)) {
    if (e.terminationType !== 'Voluntary' || e.regrettable !== true || !e.managerId) continue
    const arr = byMgr.get(e.managerId)
    if (arr) arr.push(e)
    else byMgr.set(e.managerId, [e])
  }
  const teams = [...byMgr.entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([managerId, list]) => ({ managerId, name: p.name(managerId), list }))
    .sort((a, b) => b.list.length - a.list.length || a.name.localeCompare(b.name))
  if (!teams.length) return null
  const top = teams[0]
  const mgr = p.ctx.org.byId.get(top.managerId)
  const where = mgr ? ` (${mgr.department}, ${mgr.location})` : ''
  const reason = topReasons(top.list, 1)[0]
  const others = teams.slice(1)
  const dates = top.list.map((e) => e.terminationDate as string).sort()
  const detail = [
    reason && reason.count >= 2
      ? `The most common reason given was ${reason.reason} (${reason.count} of ${top.list.length}).`
      : `They left between ${formatDate(dates[0])} and ${formatDate(dates.at(-1))}.`,
    others.length
      ? `${count(others.length, 'other manager', 'other managers')} also had 2 or more: ${nameList(
          others.map((t) => `${t.name} (${t.list.length})`),
          4,
        )}.`
      : '',
  ]
    .filter(Boolean)
    .join(' ')
  return {
    id: 'hrbp-regretted-cluster',
    severity: top.list.length >= 3 ? 'critical' : 'warning',
    title: `${possessive(top.name)} team${where} had ${top.list.length} regretted exits in the last 12 months`,
    detail,
    action: `Hold stay conversations with the rest of ${possessive(top.name)} team this month.`,
    people: people(
      teams.flatMap((t) => t.list),
      (e) => leaverNote(e, p),
    ),
    filter: mgr ? { leaderId: top.managerId } : undefined,
    tab: 'attrition',
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
  const company = kpi.companyVol
  if (company == null || !p.has.terminationType) return []
  const out: Ranked[] = []
  const phrase = windowPhrase(p)

  if (!p.ctx.isCompany && kpi.vol.rate != null && kpi.vol.avgHeadcount >= 10) {
    const diff = kpi.vol.rate - company
    const leavers = exitsIn(p.emps, p.window).filter((e) => e.terminationType === 'Voluntary')
    if (diff >= 0.03) {
      const conc = concentration(p, p.emps, [DIMS.department, DIMS.location, DIMS.level], leavers.length)
      out.push({
        id: 'hrbp-voluntary-scope',
        severity: kpi.vol.rate >= company * 1.75 && leavers.length >= 10 ? 'critical' : 'warning',
        title: `Voluntary attrition in ${p.ctx.scopeLabel} is ${pct(kpi.vol.rate)}, ${pts(diff)} above the company`,
        detail: [`${leavers.length} voluntary exits in ${phrase}${reasonClause(leavers)}.`, conc]
          .filter(Boolean)
          .join(' '),
        action: `Review the top exit reasons with ${
          p.ctx.filters.leaderId ? p.name(p.ctx.filters.leaderId) : `the ${p.ctx.scopeLabel} leaders`
        } and hold stay conversations in the most affected teams.`,
        people: people(leavers, (e) => leaverNote(e, p)),
        tab: 'attrition',
        impact: diff * kpi.vol.avgHeadcount,
      })
    } else if (diff <= -0.03) {
      out.push({
        id: 'hrbp-voluntary-good',
        severity: 'good',
        title: `Voluntary attrition in ${p.ctx.scopeLabel} is ${pct(kpi.vol.rate)}, ${pts(diff)} below the company`,
        detail: `${leavers.length} voluntary exits in ${phrase}, against ${pct(company)} for the company.`,
        action: 'Ask the leader what is working so other teams can learn from it.',
        tab: 'attrition',
        impact: 0,
      })
    }
  }

  const dimension = (rows: GroupRateRow[], key: 'location' | 'department') => {
    if (rows.filter((r) => r.avgHeadcount > 0).length < 2) return
    const hits = rows
      .filter(
        (r) =>
          r.voluntaryRate != null &&
          r.avgHeadcount >= 10 &&
          r.voluntary >= 3 &&
          r.voluntaryRate - company >= 0.03,
      )
      .map((r) => ({ ...r, excess: ((r.voluntaryRate as number) - company) * r.avgHeadcount }))
      .sort((a, b) => b.excess - a.excess)
    const top = hits[0]
    if (!top) return
    const rate = top.voluntaryRate as number
    const list = p.emps.filter((e) => (key === 'location' ? e.location : e.department) === top.group)
    const leavers = exitsIn(list, p.window).filter((e) => e.terminationType === 'Voluntary')
    const within = key === 'location' ? [DIMS.department, DIMS.level] : [DIMS.location, DIMS.level]
    const conc = concentration(p, list, within, leavers.length)
    const also = hits.slice(1).map((h) => h.group)
    const second =
      conc ||
      (also.length
        ? `${listJoin(also.slice(0, 3))} ${also.length === 1 ? 'is' : 'are'} also 3 pts or more above.`
        : '')
    out.push({
      id: `hrbp-voluntary-${key}`,
      severity: rate >= company * 1.75 && leavers.length >= 10 ? 'critical' : 'warning',
      title: `Voluntary attrition in ${top.group} is ${pct(rate)}, ${pts(rate - company)} above the company`,
      detail: [`${leavers.length} voluntary exits in ${phrase}${reasonClause(leavers)}.`, second]
        .filter(Boolean)
        .join(' '),
      action: `Review the top exit reasons with the ${top.group} leaders and hold stay conversations in the most affected teams.`,
      people: people(leavers, (e) => leaverNote(e, p)),
      filter: key === 'location' ? { location: [top.group] } : { department: [top.group] },
      tab: 'attrition',
      impact: top.excess,
    })
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
  const fy = kpi.firstYear
  const range = `${formatDate(addDays(fy.from, 1))} to ${formatDate(fy.to)}`
  const cohort = firstYearCohort(p.emps, p.asOf)
  if (fy.rate != null && fy.cohort >= 5 && fy.rate > 0.2) {
    const leavers = cohort.filter(leftInFirstYear)
    const company = p.ctx.isCompany ? null : cohortSummary(p.companyEmps, p.asOf).rate
    return {
      id: 'hrbp-first-year',
      severity: 'warning',
      title: p.ctx.isCompany
        ? `First-year attrition is ${pct(fy.rate)} (${fy.leavers} of ${fy.cohort} hires)`
        : `First-year attrition in ${p.ctx.scopeLabel} is ${pct(fy.rate)} (${fy.leavers} of ${fy.cohort} hires)${
            company != null ? `, against ${pct(company)} for the company` : ''
          }`,
      detail: `Measured on people hired ${range} who left within a year of starting.${mostIn(leavers, DIMS.department)}`,
      action: `Review onboarding and the first 90 days with the hiring managers in ${p.ctx.scopeLabel}.`,
      people: people(leavers, (e) => leaverNote(e, p)),
      tab: 'attrition',
      impact: fy.leavers,
    }
  }
  const dims: { key: 'businessUnit' | 'department' | 'location'; get: (e: Employee) => string }[] = [
    { key: 'businessUnit', get: (e) => e.businessUnit },
    { key: 'department', get: (e) => e.department },
    { key: 'location', get: (e) => e.location },
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
    const totalLeavers = cohort.filter(leftInFirstYear).length
    const hits = [...groups.entries()]
      .map(([group, list]) => {
        const leavers = list.filter(leftInFirstYear)
        const rest = cohort.length - list.length
        const restRate = rest > 0 ? (totalLeavers - leavers.length) / rest : null
        const excess = leavers.length - list.length * (fy.rate ?? 0)
        return { group, list, leavers, rate: leavers.length / list.length, restRate, excess }
      })
      .filter((g) => g.list.length >= 10 && g.leavers.length >= 3 && g.rate > 0.2)
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
      severity: 'warning',
      title: `First-year attrition in ${top.group} is ${pct(top.rate)} (${top.leavers.length} of ${top.list.length} hires)${
        top.restRate != null ? `, against ${pct(top.restRate)} elsewhere` : ''
      }`,
      detail: `Measured on people hired ${range} who left within a year of starting.${conc}`,
      action: `Review onboarding and the first 90 days with the ${top.group} hiring managers.`,
      people: people(top.leavers, (e) => leaverNote(e, p)),
      filter: { [dim.key]: [top.group] },
      tab: 'attrition',
      impact: top.leavers.length,
    }
  }
  return null
}

/* ───────── 4-7. org design ───────── */

function spanOutliers(org: OrgModel): Ranked | null {
  const wide = org.managers.filter((m) => m.directs >= 12)
  const narrow = org.managers.filter((m) => m.directs === 1)
  if (!wide.length && !narrow.length) return null
  const have = (n: number) => (n === 1 ? 'manager has' : 'managers have')
  const title =
    wide.length && narrow.length
      ? `${wide.length} ${have(wide.length)} 12 or more direct reports and ${narrow.length} ${narrow.length === 1 ? 'has' : 'have'} only one`
      : wide.length
        ? `${wide.length} ${have(wide.length)} 12 or more direct reports`
        : `${narrow.length} ${have(narrow.length)} a single direct report`
  const sentences: string[] = []
  if (wide.length) {
    const items = wide.map((m, i) => (i === 0 ? `${m.name} has ${m.directs}` : `${m.name} ${m.directs}`))
    sentences.push(`${nameList(items, 5)}.`)
  }
  if (narrow.length)
    sentences.push(
      `Single-report layers: ${nameList(
        narrow.map((m) => m.name),
        5,
      )}.`,
    )
  return {
    id: 'hrbp-span-outliers',
    severity: 'info',
    title,
    detail: sentences.join(' '),
    action:
      wide.length && narrow.length
        ? 'Review whether the wide teams need a team lead and whether the single-report layers can be merged.'
        : wide.length
          ? 'Review whether each of these teams needs a team lead or a split.'
          : 'Review whether each single-report layer is still needed or can be merged.',
    people: [...wide, ...narrow].slice(0, MAX_PEOPLE).map((m) => ({
      id: m.managerId,
      name: m.name,
      note: `${count(m.directs, 'direct report', 'direct reports')} · ${m.department}`,
    })),
    tab: 'org',
    impact: wide.length + narrow.length,
  }
}

function newManagers(p: Prep, org: OrgModel): Ranked | null {
  const list = org.managers.filter((m) => m.newManager && m.directs >= 5)
  if (!list.length) return null
  const top = list[0]
  const months = Math.max(1, Math.round(daysBetween(top.managerSince, p.asOf) / 30.436875))
  const title =
    list.length === 1
      ? `${top.name} has managed for ${count(months, 'month', 'months')} and leads ${top.directs} direct reports`
      : `${list.length} new managers lead teams of 5 or more, ${top.name} with ${top.directs} direct reports`
  const rest = list.slice(1)
  return {
    id: 'hrbp-new-managers',
    severity: list.some((m) => m.directs >= 8) ? 'warning' : 'info',
    title,
    detail: [
      'New means hired or promoted into a manager level in the last 12 months.',
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
    filter: top.directs >= 8 ? { leaderId: top.managerId } : undefined,
    tab: 'org',
    impact: top.directs,
  }
}

function singleReportChains(org: OrgModel): Ranked | null {
  if (!org.chains.length) return null
  const [first, ...rest] = org.chains
  return {
    id: 'hrbp-single-report-chains',
    severity: 'warning',
    title:
      org.chains.length === 1
        ? `${first.manager} has a single direct report who leads ${first.below} people`
        : `${org.chains.length} managers have a single direct report who leads 5 or more people`,
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
    tab: 'org',
    impact: first.below / 10,
  }
}

function orgDepth(p: Prep, org: OrgModel): Ranked | null {
  const deep = org.deep.people
  if (!deep.length) return null
  return {
    id: 'hrbp-org-depth',
    severity: org.deep.maxDepth > 9 ? 'warning' : 'info',
    title: `${count(deep.length, 'person sits', 'people sit')} more than 7 levels below the top of ${p.ctx.scopeLabel}`,
    detail: `The deepest reporting chain has ${org.deep.maxDepth + 1} layers.`,
    action:
      'Map the reporting chains past layer 7 and look for layers that can be merged at the next reorganization.',
    people: people(deep, (e) => `${e.jobTitle} · ${e.department}`),
    tab: 'org',
    impact: deep.length / 10,
  }
}

/* ───────── 8-10. growth and new hires ───────── */

/** Department headcount now vs 6 months ago, true headcount at both dates (department at each date from transfers). */
export function departmentGrowth(p: Prep): { dept: string; now: number; before: number; growth: number }[] {
  const since = addDays(trailing(p.asOf, 6).start, -1)
  const before = new Map<string, number>()
  const now = new Map<string, number>()
  for (const e of p.emps) {
    if (isActiveAt(e, since)) {
      const d = p.history.deptAt(e, since)
      before.set(d, (before.get(d) ?? 0) + 1)
    }
    if (isActiveAt(e, p.asOf)) now.set(e.department, (now.get(e.department) ?? 0) + 1)
  }
  return [...now.entries()]
    .map(([dept, n]) => ({ dept, now: n, before: before.get(dept) ?? 0 }))
    .filter((g) => g.before >= 5)
    .map((g) => ({ ...g, growth: (g.now - g.before) / g.before }))
    .sort((a, b) => b.growth - a.growth)
}

function rapidGrowth(p: Prep): Ranked | null {
  const since = addDays(trailing(p.asOf, 6).start, -1)
  const grown = departmentGrowth(p).filter((g) => g.growth >= 0.35)
  const top = grown[0]
  if (!top) return null
  const rest = grown.slice(1)
  return {
    id: 'hrbp-rapid-growth',
    severity: 'info',
    title: `${top.dept} grew ${fmt(top.growth, 'pct0')} in 6 months, from ${top.before} to ${top.now} people`,
    detail: [
      `Headcount on ${formatDate(since)} against ${formatDate(p.asOf)}.`,
      rest.length
        ? `Also growing 35% or more: ${nameList(
            rest.map((g) => g.dept),
            4,
          )}.`
        : '',
    ]
      .filter(Boolean)
      .join(' '),
    action: `Check manager capacity and onboarding support in ${top.dept}.`,
    filter: { department: [top.dept] },
    tab: 'workforce',
    impact: top.now - top.before,
  }
}

function newHireConcentration(p: Prep): Ranked | null {
  const since = trailing(p.asOf, 6).start
  const teams = new Map<string, { size: number; recent: number }>()
  for (const e of p.emps) {
    if (!isActiveAt(e, p.asOf) || !e.managerId) continue
    const t = teams.get(e.managerId) ?? { size: 0, recent: 0 }
    t.size++
    if (e.hireDate >= since) t.recent++
    teams.set(e.managerId, t)
  }
  const flagged = [...teams.entries()]
    .filter(([, t]) => t.size >= 5 && t.recent / t.size >= 0.5)
    .map(([managerId, t]) => ({ managerId, name: p.name(managerId), ...t, share: t.recent / t.size }))
    .sort((a, b) => b.share - a.share || b.size - a.size)
  if (!flagged.length) return null
  const top = flagged[0]
  const list = flagged.map((t) => `${t.name} ${t.recent} of ${t.size}`)
  return {
    id: 'hrbp-new-hire-concentration',
    severity: flagged.some((t) => t.share >= 0.65) ? 'warning' : 'info',
    title:
      flagged.length === 1
        ? `${top.recent} of ${possessive(top.name)} ${top.size} direct reports were hired in the last 6 months`
        : `${flagged.length} teams have at least half their people hired in the last 6 months`,
    detail: `Teams of 5 or more employees, hired since ${formatDate(since)}: ${nameList(list, 5)}.`,
    action:
      "Pair each new hire with an experienced buddy and keep these managers' other commitments light this quarter.",
    people: flagged.slice(0, MAX_PEOPLE).map((t) => ({
      id: t.managerId,
      name: t.name,
      note: `${t.recent} of ${t.size} direct reports hired since ${formatDate(since)}`,
    })),
    tab: 'workforce',
    impact: flagged.length,
  }
}

function unevenGrowth(p: Prep, wf: WorkforceModel): Ranked | null {
  const rows = wf.growth.filter((g) => g.growth != null)
  if (rows.length < 2) return null
  const top = rows[0]
  if ((top.growth ?? 0) < 0.1 || top.change < 10) return null
  const byBu = new Set(p.emps.map((e) => e.businessUnit)).size > 1
  const net = wf.growth.reduce((a, g) => a + g.change, 0)
  const where = p.ctx.isCompany ? 'the company' : p.ctx.scopeLabel
  const rest = net - top.change
  const share =
    net > top.change
      ? `That is ${top.change} of the net ${net} people added across ${where}.`
      : `The rest of ${where} ${rest > 0 ? `grew by ${rest}` : rest < 0 ? `shrank by ${-rest}` : 'held flat'}.`
  const flat = rows.find((g) => g !== top && Math.abs(g.growth ?? 1) < 0.01 && g.now >= 20)
  return {
    id: 'hrbp-uneven-growth',
    severity: 'info',
    title: `${top.group} grew ${pct(top.growth as number)} in 12 months, from ${top.yearAgo.toLocaleString('en-US')} to ${top.now.toLocaleString('en-US')} people`,
    detail: [share, flat ? `${flat.group} was flat at ${flat.now.toLocaleString('en-US')}.` : '']
      .filter(Boolean)
      .join(' '),
    action: `Check manager capacity and onboarding support in ${top.group}.`,
    filter: byBu ? { businessUnit: [top.group] } : { department: [top.group] },
    tab: 'workforce',
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
    spanOutliers(parts.org),
    newManagers(p, parts.org),
    singleReportChains(parts.org),
    orgDepth(p, parts.org),
    rapidGrowth(p),
    newHireConcentration(p),
    unevenGrowth(p, parts.workforce),
  ]
  return all
    .filter((f): f is Ranked => f != null)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.impact - a.impact)
    .map(({ impact: _impact, ...f }) => f)
}
