/**
 * My team on the sample in Manager mode (docs/ROLES.md 2.2 and 6.8): every new figure's numbers
 * recount from the raw rows, the tiles are the producing views' own, every number is finite or
 * null, and nothing on the page names or opens a person outside the manager's org.
 */
import { describe, expect, it, vi } from 'vitest'
import { HR_ACCESS } from '@/access/context'
import { managerLock } from '@/access/lock'
import { leaderOptions } from '@/app/filterOptions'
import { sampleCtx } from '@/ask/engine/testkit'
import type { AnalyticsContext } from '@/data/context'
import type { Employee, ISODate } from '@/data/schema'
import { isActiveAt, isEmployee } from '@/data/scope'
import { resolveDrill } from '@/drill/Drill'
import { modeHiddenColumns } from '@/drill/records'
import { addDays } from '@/lib/dates'
import { snapshotDates } from '@/lib/people'
import { median } from '@/lib/stats'
import { collectActions, roleView } from '@/views/actions/engine'
import { view as hrbp } from '@/views/hrbp'
import { view as onboarding } from '@/views/onboarding'
import { view as org } from '@/views/org'
import { view as recruiting } from '@/views/recruiting'
import { VIEWS } from '@/views/registry'
import { view as talent } from '@/views/talent'
import {
  attritionCompare,
  COMPANY_SERIES,
  companyMedianSpan,
  courseBars,
  criticalCoverage,
  criticalRoles,
  ORG_SERIES,
  openReqRows,
  orgUnderMinimum,
  overdueRows,
  overdueSpec,
  practiceFindings,
  spanRows,
  startCalendar,
  startRows,
  TEAM_TILES,
  teamFindings,
  teamKpis,
  teamLists,
  teamPeople,
  teamSources,
  waitingKpi,
} from './index'

vi.mock('idb-keyval', () => ({
  get: async () => undefined,
  set: async () => undefined,
  del: async () => undefined,
  keys: async () => [],
}))

const hr = sampleCtx()
const leaders = leaderOptions(hr.org, hr.asOf, 3)
/** A mid-size org with a manager above it, so people outside it exist on every side. */
const mid = leaders.find((l) => l.size >= 25 && l.size <= 90 && hr.org.byId.get(l.id)?.managerId)!
/** An org under the anonymity minimum. */
const small = leaders.find((l) => l.size < 5)!

const managerCtx = (managerId: string): AnalyticsContext =>
  sampleCtx({ access: { mode: 'manager', managerId } })

const ctx = managerCtx(mid.id)
const lock = managerLock(ctx.org, ctx.asOf, mid.id)!
const s = teamSources(ctx)
const labels = new Map(VIEWS.map((v) => [v.key, v]))
const labelOf = (view: string, tab: string) => {
  const v = labels.get(view as never)
  const t = v?.tabs.find((x) => x.key === tab)
  return t ? `${v?.label}, ${t.label}` : (v?.label ?? view)
}
const inOrg = (id: string | null | undefined) => !!id && lock.orgIds.has(id)

/* ───────── raw recounts ───────── */

const orgEmployees = (c: AnalyticsContext) => c.all.employees.filter((e) => lock.orgIds.has(e.employeeId))

/** Voluntary (or regretted) exits in the window ÷ mean month-end headcount, annualized. */
function recountRate(
  people: readonly Employee[],
  c: AnalyticsContext,
  kind: 'voluntary' | 'regretted',
): number {
  const w = c.window
  const emps = people.filter(isEmployee)
  const exits = emps.filter(
    (e) =>
      !!e.terminationDate &&
      e.terminationDate >= w.start &&
      e.terminationDate <= w.end &&
      e.terminationType === 'Voluntary' &&
      (kind === 'voluntary' || e.regrettable === true),
  ).length
  const pts = snapshotDates(w)
  const avg = pts.reduce((n, d) => n + emps.filter((e) => isActiveAt(e, d)).length, 0) / pts.length
  return (exits / avg) * (12 / w.months)
}

describe('the sample has the orgs this test needs', () => {
  it('has a mid-size org with a manager above it, and an org under 5', () => {
    expect(mid).toBeDefined()
    expect(small).toBeDefined()
    expect(lock.orgIds.size).toBeGreaterThan(20)
  })
})

describe('key figures and the readout', () => {
  it("are the producing views' own tiles, each opening its own view's tab", () => {
    const kpis = teamKpis(s, labelOf)
    expect(kpis.map((k) => k.id)).toEqual([...TEAM_TILES])
    const own = [...s.hrbp.kpi.kpis, ...s.recruiting.kpis, ...s.onboarding.kpis.upcoming, ...s.talent.kpis]
    for (const k of kpis) {
      const src = own.find((x) => x.id === k.id)!
      expect(k.value, k.id).toBe(src.value)
      expect(k.metricId, k.id).toBe(src.metricId)
      expect(k.drill, k.id).toBe(src.drill)
      expect(k.tab, k.id).toBeUndefined()
      expect(k.link?.view, k.id).toBeTruthy()
      expect(k.link?.label, k.id).toMatch(/^(People stats|Recruiting|Onboarding|Talent), /)
      expect(k.value == null || Number.isFinite(k.value), k.id).toBe(true)
    }
  })

  it('ranks up to six findings, critical first, and leaves out what Manager mode hides', () => {
    const list = teamFindings(ctx, practiceFindings(s, { hrbp, recruiting, onboarding, talent }))
    expect(list.length).toBeLessThanOrEqual(6)
    const rank = { critical: 0, warning: 1, info: 2, good: 3 }
    for (let i = 1; i < list.length; i++)
      expect(rank[list[i].finding.severity]).toBeGreaterThanOrEqual(rank[list[i - 1].finding.severity])
    for (const f of list) {
      expect(f.finding.severity).not.toBe('good')
      if (f.finding.metricId) expect(ctx.access.can(`metric:${f.finding.metricId}`), f.finding.id).toBe(true)
    }
  })
})

describe('managers see exits, not regretted exits (docs/ROLES-V2.md, Decisions made)', () => {
  it('has no regretted tile, finding, comparison or leaver column in Manager mode', () => {
    expect(ctx.access.mode).toBe('manager')
    const tiles = teamKpis(s, labelOf, ctx)
    expect(tiles.map((k) => k.id)).toEqual(TEAM_TILES.map((id) => (id === 'regretted' ? 'attrition' : id)))
    expect(tiles.some((k) => k.metricId === 'hrbp.attrition.regretted')).toBe(false)
    const shown = (id: string) => ctx.access.can(`metric:${id}`)
    expect(attritionCompare(s.hrbp, shown).map((r) => r.measure)).not.toContain('Regretted attrition')
    for (const f of teamFindings(ctx, practiceFindings(s, { hrbp, recruiting, onboarding, talent })))
      expect(`${f.finding.title} ${f.finding.detail ?? ''}`, f.finding.id).not.toMatch(/regrett/i)
    // Every employee list leaves out each leaver's exit reason and regrettable flag.
    const hidden = modeHiddenColumns('employees', ctx.access)
    expect(hidden.has('terminationReason')).toBe(true)
    expect(hidden.has('regrettable')).toBe(true)
    // HR keeps them.
    expect(modeHiddenColumns('employees', HR_ACCESS).has('terminationReason')).toBe(false)
  })
})

describe('People', () => {
  it("recounts the org's attrition and the company's from the roster", () => {
    const rows = attritionCompare(s.hrbp)
    const at = (measure: string, series: string) =>
      rows.find((r) => r.measure === measure && r.series === series)!
    expect(at('Voluntary attrition', ORG_SERIES).rate).toBeCloseTo(
      recountRate(orgEmployees(ctx), ctx, 'voluntary'),
      9,
    )
    expect(at('Regretted attrition', ORG_SERIES).rate).toBeCloseTo(
      recountRate(orgEmployees(ctx), ctx, 'regretted'),
      9,
    )
    expect(at('Voluntary attrition', COMPANY_SERIES).rate).toBeCloseTo(
      recountRate(ctx.all.employees, ctx, 'voluntary'),
      9,
    )
    expect(at('Regretted attrition', COMPANY_SERIES).rate).toBeCloseTo(
      recountRate(ctx.all.employees, ctx, 'regretted'),
      9,
    )
    // The org's bars open its leavers; the company's open nothing.
    for (const r of rows) {
      if (r.series === COMPANY_SERIES) expect(r.drill, r.measure).toBeNull()
      expect(r.rate == null || Number.isFinite(r.rate), r.measure).toBe(true)
    }
    const vol = resolveDrill(at('Voluntary attrition', ORG_SERIES).drill)!
    for (const e of vol.rows as Employee[]) expect(inOrg(e.employeeId), e.employeeId).toBe(true)
  })

  it("recounts each manager's direct reports and the company median span from the roster", () => {
    const active = (d: ISODate) => ctx.all.employees.filter((e) => isActiveAt(e, d))
    const now = active(ctx.asOf)
    const activeIds = new Set(now.map((e) => e.employeeId))
    for (const r of spanRows(s.hrbp)) {
      expect(inOrg(r.managerId), r.name).toBe(true)
      expect(r.directs, r.name).toBe(now.filter((e) => e.managerId === r.managerId).length)
    }
    const spans = new Map<string, number>()
    for (const e of now)
      if (e.managerId && activeIds.has(e.managerId)) spans.set(e.managerId, (spans.get(e.managerId) ?? 0) + 1)
    expect(companyMedianSpan(ctx)).toBe(median([...spans.values()]))
  })
})

describe('Hiring', () => {
  it('counts each week of starts once, by readiness, inside the week', () => {
    const weeks = startCalendar(s.onboarding)
    const byWeek = new Map<string, number>()
    for (const w of weeks) {
      byWeek.set(w.week, (byWeek.get(w.week) ?? 0) + w.starts)
      expect(w.people.length).toBe(w.starts)
      for (const p of w.people) {
        expect(p.startDate >= w.week && p.startDate <= addDays(w.week, 6), p.name).toBe(true)
        if (p.employee) expect(inOrg(p.employee.employeeId), p.name).toBe(true)
      }
    }
    for (const [week, n] of byWeek) {
      const end = addDays(week, 6)
      // Pre-hires on the roster plus accepted offers, as Onboarding lists upcoming starts.
      expect(n, week).toBe(
        s.onboarding.upcoming.rows.filter((r) => r.start.startDate >= week && r.start.startDate <= end)
          .length,
      )
      const prehires = orgEmployees(ctx).filter(
        (e) => e.hireDate >= week && e.hireDate <= end && e.hireDate > ctx.asOf,
      )
      expect(n, week).toBeGreaterThanOrEqual(prehires.length)
    }
  })

  it("lists the org's open reqs, the ones that need attention first", () => {
    const reqs = openReqRows(s.recruiting)
    const open = ctx.all.requisitions.filter(
      (r) => inOrg(r.hiringManagerId) && r.openedDate <= ctx.asOf && r.status === 'Open',
    )
    expect(reqs.length).toBeLessThanOrEqual(open.length + s.recruiting.base.req.onHold.length)
    for (const r of reqs) expect(inOrg(r.row.req.hiringManagerId), r.reqId).toBe(true)
    const ranks = reqs.map((r) => (r.severity === 'critical' ? 0 : r.severity === 'warning' ? 1 : 2))
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks)
    for (const r of startRows(s.onboarding)) expect(Number.isFinite(r.daysToGo)).toBe(true)
  })
})

describe('Talent', () => {
  it("recounts the critical roles from the succession plans, and every course's on-time share", () => {
    const roles = criticalRoles(s.talent)
    const raw = new Set(
      ctx.all.succession
        .filter((r) => r.criticality === 'Critical' && inOrg(r.incumbentId))
        .map((r) => r.roleId),
    )
    expect(roles.length).toBe(raw.size)
    expect(criticalCoverage(s.talent).reduce((n, c) => n + c.roles, 0)).toBe(roles.length)
    for (const r of roles) expect(inOrg(r.incumbentId), r.roleTitle).toBe(true)

    const w = ctx.window
    for (const c of courseBars(s.talent)) {
      const due = ctx.all.learning.filter((l) => {
        if (!l.required || !l.dueDate || !c.courses.includes(l.course)) return false
        if (l.dueDate < w.start || l.dueDate > w.end || l.dueDate > ctx.asOf) return false
        const e = ctx.org.byId.get(l.employeeId)
        return !!e && inOrg(e.employeeId) && isEmployee(e) && isActiveAt(e, l.dueDate)
      })
      expect(c.due, c.course).toBe(due.length)
      expect(c.onTime, c.course).toBe(
        due.filter((l) => !!l.completedDate && l.completedDate <= l.dueDate!).length,
      )
      if (c.onTimeRate != null) expect(c.onTimeRate).toBeCloseTo(c.onTime / c.due, 12)
    }
  })

  it('opens each overdue assignment as its own learning record, for someone in the org', () => {
    for (const r of overdueRows(s.talent)) {
      expect(inOrg(r.employeeId), r.name).toBe(true)
      const spec = overdueSpec(s.talent, r, ctx.scopeLabel)
      expect(spec.rows.length, r.name).toBeGreaterThan(0)
      for (const l of spec.rows) expect(l.employeeId).toBe(r.employeeId)
    }
  })
})

describe('Needs attention and Waiting on others', () => {
  it("splits the org's open items the way the Action center does, the manager's own in Needs attention", () => {
    const collected = collectActions(ctx, [recruiting, onboarding, hrbp, org, talent])
    const lists = teamLists(ctx, collected, () => true)
    const view = roleView(collected, ctx, () => true)
    expect(lists.needs.map((a) => a.id)).toEqual(view.needs.map((a) => a.id))
    expect(lists.waiting.map((a) => a.id)).toEqual(view.waiting.map((a) => a.id))
    for (const a of lists.needs) expect(a.ownerId ?? a.ownerName, a.id).toBe(a.ownerId ? mid.id : a.ownerName)
    for (const a of [...lists.needs, ...lists.waiting])
      expect(a.id.startsWith('onboarding:i9:'), a.id).toBe(false)
    const k = waitingKpi(ctx, lists.needs)!
    expect(k.value).toBe(lists.needs.length)
    expect(k.metricId).toBe('actions.items.open')
    // Handled or snoozed items are left out.
    expect(teamLists(ctx, collected, () => false)).toEqual({ needs: [], waiting: [] })
  })
})

describe('My list: my team', () => {
  it('lists the active people of the org, direct reports first, with their own records only', () => {
    const rows = teamPeople(ctx, s, mid.id)
    expect(rows.length).toBeGreaterThan(0)
    let indirect = false
    for (const r of rows) {
      expect(inOrg(r.employeeId), r.name).toBe(true)
      if (!r.direct) indirect = true
      else expect(indirect, 'direct reports come first').toBe(false)
      for (const l of r.courses) expect(l.employeeId).toBe(r.employeeId)
      for (const q of r.reqs) expect(q.hiringManagerId).toBe(r.employeeId)
      if (r.probation) expect(r.probation.employeeId).toBe(r.employeeId)
      expect(r.overdueCourses).toBe(r.courses.length)
    }
    expect(rows.some((r) => r.employeeId === mid.id)).toBe(false)
  })
})

describe('nobody outside the org', () => {
  it('appears on any figure of the page, by id or by name', () => {
    const ids: string[] = []
    const add = (id: string | null | undefined) => {
      if (id) ids.push(id)
    }
    const h = s.hrbp
    for (const r of h.workforce.tenure) for (const e of r.records) add(e.employeeId)
    for (const r of h.workforce.byLevel) for (const e of r.records) add(e.employeeId)
    for (const r of h.workforce.flows) for (const e of r.records) add(e.employeeId)
    for (const r of spanRows(h)) {
      add(r.managerId)
      for (const e of r.manager.reports) add(e.employeeId)
    }
    for (const k of teamKpis(s, labelOf)) {
      const spec = resolveDrill(k.drill)
      if (spec?.kind === 'employees') for (const e of spec.rows as Employee[]) add(e.employeeId)
    }
    for (const w of startCalendar(s.onboarding)) for (const p of w.people) add(p.employee?.employeeId)
    for (const r of startRows(s.onboarding)) {
      add(r.r.start.employee?.employeeId)
      add(r.r.start.hiringManagerId)
    }
    for (const r of overdueRows(s.talent)) add(r.employeeId)
    for (const r of criticalRoles(s.talent)) add(r.incumbentId)
    for (const f of teamFindings(ctx, practiceFindings(s, { hrbp, recruiting, onboarding, talent })))
      for (const p of f.finding.people ?? []) add(p.id)
    // Candidates joining the org (application IDs) are not on the roster: only employees are checked.
    const outside = [...new Set(ids)].filter((id) => ctx.org.byId.has(id) && !inOrg(id))
    expect(ids.length).toBeGreaterThan(50)
    expect(outside).toEqual([])
    // Successors outside the org show by readiness only, never by name.
    const outsideNames = ctx.all.employees.filter((e) => !inOrg(e.employeeId)).map((e) => e.name)
    for (const r of criticalRoles(s.talent))
      for (const name of outsideNames)
        expect(r.successorNames.includes(name), `${r.roleTitle}: ${name}`).toBe(false)
  })
})

describe('an org under the anonymity minimum', () => {
  it('shows counts and lists, and hides every rate', () => {
    const c = managerCtx(small.id)
    const t = teamSources(c)
    const rows = attritionCompare(t.hrbp).filter((r) => r.series === ORG_SERIES)
    for (const r of rows) {
      expect(r.rate, r.measure).toBeNull()
      expect(r.drill, r.measure).toBeNull()
    }
    expect(t.hrbp.kpi.headcount).toBeLessThan(5)
    expect(t.hrbp.workforce.tenure.reduce((n, r) => n + r.headcount, 0)).toBe(t.hrbp.kpi.headcount)
  })

  it('hides the training on-time rate too, though Talent counts more people over the period', () => {
    const c = managerCtx(small.id)
    const t = teamSources(c)
    expect(orgUnderMinimum(c, t)).toBe(true)
    const labelOf = () => ''
    const tiles = teamKpis(t, labelOf, c, true)
    // Manager mode: the attrition tile (every exit) in place of regretted attrition.
    for (const id of ['voluntary', 'attrition', 'talent-training-on-time']) {
      const k = tiles.find((x) => x.id === id)!
      expect(k, id).toBeDefined()
      expect(k.value, id).toBeNull()
      expect(k.suppressed, id).toBe(true)
      expect(k.drill, id).toBeUndefined()
      expect(k.spark, id).toBeUndefined()
    }
    // Counts stay: headcount, open reqs and starts are not rates.
    expect(tiles.find((x) => x.id === 'headcount')?.value).toBe(t.hrbp.kpi.headcount)
    // A mid-size org is not under the minimum, and its tiles are the producing views' own.
    const m = managerCtx(mid.id)
    const tm = teamSources(m)
    expect(orgUnderMinimum(m, tm)).toBe(false)
    expect(
      teamKpis(tm, labelOf, m, false).find((x) => x.id === 'talent-training-on-time')?.suppressed,
    ).not.toBe(true)
  })
})
