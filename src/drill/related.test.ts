import { describe, expect, it } from 'vitest'
import { buildContext } from '@/data/context'
import { isFieldRef } from '@/data/quality/fieldRef'
import { generateSample } from '@/data/sample'
import { CASE_OPEN_STATUSES, DATASET_KEYS, type DatasetKey, type HrCase } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { personSummary } from './person'
import {
  activeDirects,
  activeOrg,
  directsSpec,
  openCases,
  openCasesSpec,
  orgSpec,
  overdueRequired,
  overdueSpec,
  reqActive,
  reqActiveSpec,
  reqApplications,
  reqApplicationsSpec,
} from './related'

const data = generateSample()
const sources = Object.fromEntries(
  DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }]),
) as Record<DatasetKey, SourceMeta>
const ctx = buildContext({ data, sources, filters: DEFAULT_FILTERS, asOfOverride: null, showPay: false })

const activeManager = [...ctx.org.children.keys()].find((id) => {
  const e = ctx.org.byId.get(id)!
  return (
    !e.terminationDate && e.managerId && activeDirects(ctx, id).length >= 2 && activeOrg(ctx, id).length > 5
  )
})!

describe('the org below a person', () => {
  it('lists exactly the people the person card counts', () => {
    const p = personSummary(ctx, activeManager)!
    const directs = directsSpec(ctx, activeManager)!
    const org = orgSpec(ctx, activeManager)!
    expect(directs.rows).toHaveLength(p.directs.length)
    expect(org.rows).toHaveLength(p.orgSize)
    expect(directs.title).toBe(`Direct reports of ${p.employee.name}`)
    expect(org.title).toBe(`Everyone in ${p.employee.name}'s org`)
    expect(org.rows.every((e) => e.employeeId !== activeManager)).toBe(true)
    // Every direct report is in the org, and everyone listed is active on the as-of date.
    const inOrg = new Set(org.rows.map((e) => e.employeeId))
    expect(directs.rows.every((e) => inOrg.has(e.employeeId))).toBe(true)
    expect(org.rows.every((e) => !e.terminationDate || e.terminationDate > ctx.asOf)).toBe(true)
  })

  it('has nothing to open for someone with no reports', () => {
    const ic = data.employees.find((e) => !ctx.org.children.has(e.employeeId) && !e.terminationDate)!
    expect(directsSpec(ctx, ic.employeeId)).toBeNull()
    expect(orgSpec(ctx, ic.employeeId)).toBeNull()
  })

  it('declares fields that exist in the schema', () => {
    for (const spec of [
      directsSpec(ctx, activeManager),
      orgSpec(ctx, activeManager),
      reqApplicationsSpec(ctx, data.requisitions[0]),
    ])
      expect(spec?.uses?.every(isFieldRef)).toBe(true)
  })
})

describe('open items', () => {
  const isEr = (c: HrCase) => c.category === 'Employee relations'
  const rawOpen = (id: string) =>
    data.cases.filter((c) => c.requesterId === id && CASE_OPEN_STATUSES.includes(c.status))

  it('lists exactly the open cases the person card counts, with no employee relations case', () => {
    const plain = data.employees.find((e) => openCases(ctx, e.employeeId).length > 0)!
    const p = personSummary(ctx, plain.employeeId)!
    const spec = openCasesSpec(ctx, plain.employeeId)!
    expect(spec.rows).toHaveLength(p.openCases)
    expect(spec.kind).toBe('cases')
    expect(spec.note).toBe('Cases they raised that are not yet resolved or closed, oldest first.')
    for (const e of data.employees) expect(openCases(ctx, e.employeeId).some(isEr)).toBe(false)
  })

  it('never reveals an open employee relations case on a person card', () => {
    // Someone whose only open case is employee relations reads like someone with no open case.
    const erOnly = data.employees.filter((e) => {
      const open = rawOpen(e.employeeId)
      return open.length > 0 && open.every(isEr)
    })
    expect(erOnly.length).toBeGreaterThan(0)
    for (const e of erOnly) {
      expect(personSummary(ctx, e.employeeId)!.openCases).toBe(0)
      expect(openCasesSpec(ctx, e.employeeId)).toBeNull()
    }
    // With mixed cases, the count and the list agree and nothing mentions employee relations.
    const mixed = data.employees.find((e) => {
      const open = rawOpen(e.employeeId)
      return open.some(isEr) && open.some((c) => !isEr(c))
    })
    if (mixed) {
      const spec = openCasesSpec(ctx, mixed.employeeId)!
      const nonEr = rawOpen(mixed.employeeId).filter((c) => !isEr(c)).length
      expect(personSummary(ctx, mixed.employeeId)!.openCases).toBe(nonEr)
      expect(spec.rows).toHaveLength(nonEr)
      expect(JSON.stringify([spec.title, spec.subtitle, spec.note]).toLowerCase()).not.toContain(
        'employee relations',
      )
    }
  })

  it('counts 0 open HR cases for a person whose only open case is employee relations', () => {
    const asOf = ctx.asOf
    const base = data.cases.find(isEr)!
    const opened = `${asOf}T09:00`
    const er: HrCase = { ...base, requesterId: 'E99999', status: 'New', openedAt: opened, resolvedAt: null }
    const other: HrCase = { ...er, caseId: 'HR-999999', category: 'Payroll' }
    const only = { ...ctx, all: { ...ctx.all, cases: [er] } }
    expect(openCases(only, 'E99999')).toEqual([])
    expect(openCasesSpec(only, 'E99999')).toBeNull()
    // The same person with one other open case: 1, and the list holds only that case.
    const both = { ...ctx, all: { ...ctx.all, cases: [er, other] } }
    expect(openCases(both, 'E99999').map((c) => c.caseId)).toEqual(['HR-999999'])
    expect(openCasesSpec(both, 'E99999')?.rows).toHaveLength(1)
  })

  it('lists overdue required courses, the count on the card', () => {
    const late = data.employees.find((e) => overdueRequired(ctx, e.employeeId).length > 0)!
    const spec = overdueSpec(ctx, late.employeeId)!
    expect(spec.rows).toHaveLength(personSummary(ctx, late.employeeId)!.overdueTraining)
    expect(spec.rows.every((l) => l.required && !l.completedDate && l.dueDate! < ctx.asOf)).toBe(true)
  })
})

describe("a requisition's applications", () => {
  it('lists every application received by the as-of date, and the active ones', () => {
    const req = data.requisitions.find((r) => reqActive(ctx, r.reqId).length > 1)!
    const apps = reqApplicationsSpec(ctx, req)!
    const active = reqActiveSpec(ctx, req)!
    expect(apps.rows).toHaveLength(reqApplications(ctx, req.reqId).length)
    expect(apps.rows.every((c) => c.reqId === req.reqId && c.appliedDate <= ctx.asOf)).toBe(true)
    expect(active.rows.every((c) => c.status === 'Active')).toBe(true)
    expect(active.rows.length).toBeLessThanOrEqual(apps.rows.length)
    expect(apps.title).toContain(req.reqId)
  })
})
