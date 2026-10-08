/**
 * Every item kind recounted from raw rows (docs/ACTION-CENTER-AUDIT.md 3.1 and part 6, Correctness):
 * one case per kind on the sample, whole company, HR mode. Where the rule is plain (a case past its
 * target, a transaction past due, overdue training by manager, a critical role with no ready
 * successor, regretted exit clusters, a req outside the hiring plan, people below range minimum) the
 * recount rebuilds the same ids from the raw rows; where the rule leans on a view's norms or
 * settings, every id is checked to name a raw record that meets the rule's core condition.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { sampleCtx, sampleData } from '@/ask/engine/testkit'
import type { AnalyticsContext } from '@/data/context'
import type { Datasets, Employee } from '@/data/schema'
import { resolveDrill } from '@/drill/Drill'
import { addDays, addMonths, daysBetween } from '@/lib/dates'
import { VIEWS } from '@/views/registry'
import type { ActionItem } from '@/views/types'
import { idKind, KIND_LABEL } from './kind'

let ctx: AnalyticsContext
let data: Datasets
let asOf: string
/** The views' own items, before the Action center folds or rates them. */
let byKind: Map<string, ActionItem[]>
let people: Map<string, Employee>

beforeAll(() => {
  ctx = sampleCtx()
  data = sampleData()
  asOf = ctx.asOf
  people = new Map(data.employees.map((e) => [e.employeeId, e]))
  byKind = new Map()
  for (const v of VIEWS)
    for (const i of v.actions?.(ctx) ?? []) {
      const k = idKind(i.id) ?? i.id
      byKind.set(k, [...(byKind.get(k) ?? []), i])
    }
}, 120_000)

const tail = (id: string, from = 2) => id.split(':').slice(from).join(':')
const idsOf = (kind: string) => new Set((byKind.get(kind) ?? []).map((i) => tail(i.id)))
const active = (e: Employee | undefined) =>
  !!e && e.hireDate <= asOf && (!e.terminationDate || e.terminationDate > asOf)
const sorted = (xs: Iterable<string>) => [...xs].sort()

describe('recounts from raw rows', () => {
  it('covers every kind the sample raises', () => {
    const named = Object.keys(KIND_LABEL).filter((k) => !k.endsWith('-'))
    for (const k of byKind.keys()) {
      const known =
        named.includes(k) || Object.keys(KIND_LABEL).some((p) => p.endsWith('-') && k.startsWith(p))
      expect(known, k).toBe(true)
    }
  })

  it('services:case: open cases past their resolution target', () => {
    const end = Date.parse(`${asOf}T23:59:59Z`)
    const expected = data.cases
      .filter((c) => {
        const resolved = c.resolvedAt && Date.parse(c.resolvedAt) <= end
        const open = !resolved && !['Resolved', 'Closed'].includes(c.status)
        if (!open || c.resolutionTargetHours == null) return false
        return (end - Date.parse(c.openedAt)) / 3_600_000 > c.resolutionTargetHours
      })
      .map((c) => c.caseId)
    expect(sorted(idsOf('services:case'))).toEqual(sorted(expected))
  })

  it('services:tx: transactions past their due date and not completed by the as-of date', () => {
    const expected = data.transactions
      .filter((t) => t.dueDate && t.dueDate < asOf && !(t.completedDate && t.completedDate <= asOf))
      .map((t) => t.transactionId)
    expect(sorted(idsOf('services:tx'))).toEqual(sorted(expected))
  })

  it('services:return: each is a leave with an expected return ahead, for an employee on the roster', () => {
    const items = byKind.get('services:return') ?? []
    expect(items.length).toBeGreaterThan(0)
    for (const i of items) {
      const due = i.due as string
      expect(due >= asOf, i.id).toBe(true)
      expect(
        data.transactions.some((t) => t.employeeId === i.subject.id && t.expectedReturnDate === due),
        i.id,
      ).toBe(true)
    }
  })

  it('compliance:license: every start without an export license in force', () => {
    const rtw = new Map(data.rightToWork.map((r) => [r.employeeId, r]))
    const working = data.employees
      .filter((e) => active(e))
      .filter((e) => {
        const r = rtw.get(e.employeeId)
        return !!r?.exportLicenseRequired && !['Approved', 'Not needed'].includes(r.exportLicenseStatus ?? '')
      })
      .map((e) => e.employeeId)
    const started = (byKind.get('compliance:license') ?? []).filter((i) => (i.due as string) <= asOf)
    expect(sorted(started.map((i) => tail(i.id)))).toEqual(sorted(working))
    // Pending starts: a future start with a license required and not in force.
    for (const i of byKind.get('compliance:license') ?? []) {
      const r = rtw.get(tail(i.id))
      expect(r?.exportLicenseRequired, i.id).toBe(true)
      expect(['Approved', 'Not needed'], i.id).not.toContain(r?.exportLicenseStatus)
    }
  })

  it('compliance:reverification: an active employee whose authorization ends, with no reverification', () => {
    const rtw = new Map(data.rightToWork.map((r) => [r.employeeId, r]))
    const items = byKind.get('compliance:reverification') ?? []
    expect(items.length).toBeGreaterThan(0)
    for (const i of items) {
      const r = rtw.get(tail(i.id))
      expect(r?.expiryDate, i.id).toBeTruthy()
      expect(active(people.get(tail(i.id))), i.id).toBe(true)
    }
  })

  it('compliance:i9: US starts past the Section 2 deadline with no Section 2 date', () => {
    const rtw = new Map(data.rightToWork.map((r) => [r.employeeId, r]))
    for (const i of byKind.get('compliance:i9') ?? []) {
      const r = rtw.get(tail(i.id))
      expect(r?.i9Section2Date ?? null, i.id).toBeNull()
      expect((i.due as string) < asOf, i.id).toBe(true)
    }
  })

  it('talent:training-overdue: overdue required assignments of active employees (not contractors), by manager', () => {
    const groups = new Set<string>()
    for (const l of data.learning) {
      if (!l.required || !l.dueDate || l.dueDate >= asOf) continue
      if (l.completedDate && l.completedDate <= asOf) continue
      const e = people.get(l.employeeId)
      if (!active(e) || e?.employmentType !== 'Employee') continue
      groups.add(e?.managerId || 'none')
    }
    expect(sorted(idsOf('talent:training-overdue'))).toEqual(sorted(groups))
  })

  it('talent:critical-role: critical roles whose active incumbent has no active successor ready now', () => {
    const roles = new Map<string, { incumbent: string; ready: boolean }>()
    for (const p of data.succession) {
      if (p.criticality !== 'Critical') continue
      const r = roles.get(p.roleId) ?? { incumbent: p.incumbentId, ready: false }
      if (p.successorId && p.readiness === 'Ready now' && active(people.get(p.successorId))) r.ready = true
      roles.set(p.roleId, r)
    }
    const expected = [...roles.entries()]
      .filter(([, r]) => !r.ready && active(people.get(r.incumbent)))
      .map(([id]) => id)
    expect(sorted(idsOf('talent:critical-role'))).toEqual(sorted(expected))
  })

  it('talent:course-below-target: a required course with assignments overdue', () => {
    const items = byKind.get('talent:course-below-target') ?? []
    expect(items.length).toBeGreaterThan(0)
    for (const i of items) {
      const course = tail(i.id)
      const due = data.learning.filter(
        (l) => l.required && l.course === course && l.dueDate && l.dueDate <= asOf,
      )
      expect(due.length, course).toBeGreaterThanOrEqual(5)
      expect(
        due.some((l) => !l.completedDate || l.completedDate > (l.dueDate as string)),
        course,
      ).toBe(true)
    }
  })

  it('talent:promotion-overdue and talent:review-missing: one per business unit or manager on record', () => {
    const units = new Set(data.employees.map((e) => e.businessUnit))
    for (const i of byKind.get('talent:promotion-overdue') ?? [])
      expect(units.has(tail(i.id)), i.id).toBe(true)
    for (const i of byKind.get('talent:review-missing') ?? [])
      expect(tail(i.id) === 'none' || people.has(tail(i.id)), i.id).toBe(true)
  })

  it('hrbp:stay-conversations: two or more regretted voluntary exits in 12 months from one manager', () => {
    const from = addMonths(asOf, -12)
    const n = new Map<string, number>()
    for (const e of data.employees) {
      const t = e.terminationDate
      if (!t || t <= from || t > asOf || e.terminationType !== 'Voluntary' || !e.regrettable || !e.managerId)
        continue
      n.set(e.managerId, (n.get(e.managerId) ?? 0) + 1)
    }
    const expected = [...n.entries()].filter(([, c]) => c >= 2).map(([m]) => m)
    expect(sorted(idsOf('hrbp:stay-conversations'))).toEqual(sorted(expected))
  })

  it('hrbp:span, org:single-report-chain and org:new-manager: managers of active people', () => {
    const reports = new Map<string, number>()
    for (const e of data.employees)
      if (active(e) && e.managerId) reports.set(e.managerId, (reports.get(e.managerId) ?? 0) + 1)
    for (const k of ['hrbp:span', 'org:new-manager'])
      for (const i of byKind.get(k) ?? []) expect(reports.get(tail(i.id)) ?? 0, i.id).toBeGreaterThan(0)
    for (const i of byKind.get('org:single-report-chain') ?? []) expect(reports.get(tail(i.id)), i.id).toBe(1)
  })

  it('comp:below-minimum: one item counting active people paid below their range minimum', () => {
    const latest = new Map<string, (typeof data.comp)[number]>()
    for (const c of data.comp) latest.set(c.employeeId, c)
    const below = [...latest.values()].filter(
      (c) => active(people.get(c.employeeId)) && c.baseSalary < c.rangeMin,
    )
    const items = byKind.get('comp:below-minimum') ?? []
    expect(items.map((i) => i.id)).toEqual(['comp:below-minimum:all'])
    expect(items[0].what).toMatch(new RegExp(`^${below.length} people`))
  })

  it('comp:guideline-exception, comp:high-rated-low-compa and comp:over-budget: people and units with comp rows', () => {
    const units = new Set(data.employees.map((e) => e.businessUnit))
    for (const k of [
      'comp:guideline-exception',
      'comp:high-rated-low-compa',
      'comp:over-budget',
      'comp:no-proposal',
    ])
      for (const i of byKind.get(k) ?? []) expect(units.has(tail(i.id)), i.id).toBe(true)
  })

  it('onboarding:task: open day-one tasks that are overdue, blocked or not started', () => {
    const items = byKind.get('onboarding:task') ?? []
    expect(items.length).toBeGreaterThan(0)
    for (const i of items) {
      const [, , app, ...task] = i.id.split(':')
      // Keyed by the application ID, so a task still matches once the HRIS enters the pre-hire.
      const t = data.onboardingTasks.find(
        (x) =>
          (x.applicationId === app ||
            x.employeeId === app ||
            (!!x.employeeId && x.employeeId === i.subject.id)) &&
          x.task === task.join(':'),
      )
      expect(t, i.id).toBeTruthy()
      expect(t?.completedDate && t.completedDate <= asOf, i.id).toBeFalsy()
      expect(
        t?.status === 'Blocked' || t?.status === 'Not started' || (t?.dueDate ?? '9999') < asOf,
        i.id,
      ).toBe(true)
    }
  })

  it('onboarding:probation: an active new hire', () => {
    for (const i of byKind.get('onboarding:probation') ?? []) {
      const e = people.get(tail(i.id))
      expect(active(e), i.id).toBe(true)
      expect(daysBetween(e?.hireDate as string, asOf) < 366, i.id).toBe(true)
    }
  })

  it('onboarding:not-in-plan: open reqs on no line of the latest plan, backfills apart', () => {
    const versions = [...new Set(data.hiringPlan.map((l) => l.planVersion ?? ''))].sort()
    const latest = versions.at(-1) ?? ''
    const planned = new Set(
      data.hiringPlan.filter((l) => (l.planVersion ?? '') === latest && l.reqId).map((l) => l.reqId),
    )
    const expected = data.requisitions
      .filter((r) => r.status === 'Open' && r.reqType !== 'Backfill' && !planned.has(r.reqId))
      .map((r) => r.reqId)
    expect(sorted(idsOf('onboarding:not-in-plan'))).toEqual(sorted(expected))
  })

  it('onboarding:plan-behind and onboarding:plan-no-req: plan lines that exist', () => {
    const pairs = new Set(data.hiringPlan.map((l) => `${l.businessUnit}:${l.department}`))
    for (const i of byKind.get('onboarding:plan-behind') ?? []) expect(pairs.has(tail(i.id)), i.id).toBe(true)
    // One roll-up per business unit with a planned role and no open req; its lines exist and are uncovered.
    const units = new Set(data.hiringPlan.map((l) => l.businessUnit))
    const reqs = new Map(data.requisitions.map((r) => [r.reqId, r]))
    for (const i of byKind.get('onboarding:plan-no-req') ?? []) {
      expect(units.has(tail(i.id)), i.id).toBe(true)
      expect((i.due as string) >= addDays(asOf, -31), i.id).toBe(true)
      const spec = resolveDrill(i.drill)
      expect(spec?.kind, i.id).toBe('hiringPlan')
      for (const line of (spec?.rows ?? []) as typeof data.hiringPlan) {
        expect(line.businessUnit, i.id).toBe(tail(i.id))
        if (line.reqId)
          expect(['On hold', 'Cancelled', undefined], i.id).toContain(reqs.get(line.reqId)?.status)
      }
    }
  })

  it('recruiting candidate steps: active candidates on reqs open on the as-of date, decisions with the hiring manager', () => {
    const apps = new Map(data.candidates.map((c) => [c.applicationId, c]))
    const reqs = new Map(data.requisitions.map((r) => [r.reqId, r]))
    let n = 0
    for (const [k, items] of byKind)
      if (/^recruiting:(review|schedule-|decision|offer)/.test(k))
        for (const i of items) {
          const c = apps.get(tail(i.id))
          expect(c?.status, i.id).toBe('Active')
          const r = reqs.get(c?.reqId as string)
          expect(r?.status, i.id).toBe('Open')
          if (k === 'recruiting:decision') expect(i.ownerId, i.id).toBe(r?.hiringManagerId)
          n++
        }
    expect(n).toBeGreaterThan(0)
  })

  it('recruiting:empty-funnel and recruiting:past-target: open reqs, past target with no empty funnel twice', () => {
    const reqs = new Map(data.requisitions.map((r) => [r.reqId, r]))
    const empty = idsOf('recruiting:empty-funnel')
    for (const id of empty) {
      expect(reqs.get(id)?.status, id).toBe('Open')
      const past = data.candidates.some(
        (c) => c.reqId === id && c.status === 'Active' && !['Applied', 'Screen'].includes(c.currentStage),
      )
      expect(past, id).toBe(false)
    }
    for (const id of idsOf('recruiting:past-target')) {
      const r = reqs.get(id)
      expect(r?.status, id).toBe('Open')
      expect(daysBetween(r?.openedDate as string, asOf), id).toBeGreaterThan(45)
      expect(empty.has(id), id).toBe(false)
    }
  })

  it('listening items: a group large enough to report, owned by the practice it is about', () => {
    const sites = new Set(data.employees.map((e) => e.location))
    for (const i of byKind.get('listening:exit') ?? []) expect(sites.has(tail(i.id)), i.id).toBe(true)
    for (const i of byKind.get('listening:manager') ?? []) expect(people.has(tail(i.id)), i.id).toBe(true)
    for (const k of ['listening:stay', 'listening:readiness'])
      for (const i of byKind.get(k) ?? []) expect(i.subject.kind, i.id).toBe('none')
  })
})
