import { describe, expect, it } from 'vitest'
import { buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { personSummary } from './person'
import { buildDrillTable, drillNoun, PERSON_KEY } from './records'
import { drillSpec } from './types'

const data = generateSample()
const sources = Object.fromEntries(
  DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }]),
) as Record<DatasetKey, SourceMeta>
const ctx = buildContext({ data, sources, filters: DEFAULT_FILTERS, asOfOverride: null, showPay: false })

describe('drill tables', () => {
  it('builds an employee list with names resolved and person keys', () => {
    const leavers = data.employees
      .filter((e) => e.terminationDate && e.terminationType === 'Voluntary')
      .slice(0, 10)
    const t = buildDrillTable(drillSpec({ kind: 'employees', title: 'Leavers', rows: leavers }), ctx)
    expect(t.rows).toHaveLength(10)
    expect(t.rows[0][PERSON_KEY]).toBe(leavers[0].employeeId)
    expect(t.rows[0].status).toBe('Left')
    expect(t.columns.map((c) => c.key)).toContain('terminationReason')
    const mgr = leavers.find((e) => e.managerId)!
    const row = t.rows.find((r) => r.employeeId === mgr.employeeId)!
    expect(row.manager).toBe(ctx.org.byId.get(mgr.managerId!)!.name)
  })

  it('drops standard columns that are empty for every row', () => {
    const active = data.employees
      .filter((e) => !e.terminationDate && e.employmentType === 'Employee')
      .slice(0, 20)
    const t = buildDrillTable(drillSpec({ kind: 'employees', title: 'Active', rows: active }), ctx)
    expect(t.columns.map((c) => c.key)).not.toContain('terminationDate')
  })

  it('every record kind renders without throwing', () => {
    for (const kind of DATASET_KEYS) {
      const rows = (data[kind] as unknown[]).slice(0, 25)
      const t = buildDrillTable({ kind, title: kind, rows } as never, ctx)
      expect(t.rows).toHaveLength(rows.length)
      expect(t.columns.length).toBeGreaterThan(3)
    }
  })

  it('marks pay columns so they hide unless pay is on', () => {
    const t = buildDrillTable(drillSpec({ kind: 'comp', title: 'Comp', rows: data.comp.slice(0, 5) }), ctx)
    expect(t.columns.find((c) => c.key === 'baseSalary')?.pay).toBe(true)
    expect(t.columns.find((c) => c.key === 'compaRatio')?.pay).toBeUndefined()
  })

  it('keeps employee relations cases at category level', () => {
    const er = data.cases.filter((c) => c.category === 'Employee relations').slice(0, 3)
    const t = buildDrillTable(drillSpec({ kind: 'cases', title: 'ER', rows: er }), ctx)
    expect(t.rows.every((r) => r.subcategory == null)).toBe(true)
  })

  it('adds extra columns from the view', () => {
    const t = buildDrillTable(
      drillSpec({
        kind: 'candidates',
        title: 'Waiting',
        rows: data.candidates.slice(0, 3),
        extra: {
          columns: [{ key: 'wait', label: 'Days waiting', format: 'days' }],
          values: () => ({ wait: 7 }),
        },
      }),
      ctx,
    )
    expect(t.columns.at(-1)?.key).toBe('wait')
    expect(t.rows[0].wait).toBe(7)
  })

  it('counts with the right noun', () => {
    expect(drillNoun('employees', 1)).toBe('1 person')
    expect(drillNoun('cases', 1204)).toBe('1,204 cases')
  })
})

describe('person summary', () => {
  it('describes a manager with chain, team and history', () => {
    const mgrId = [...ctx.org.children.keys()].find((id) => {
      const e = ctx.org.byId.get(id)!
      return !e.terminationDate && e.managerId
    })!
    const p = personSummary(ctx, mgrId)!
    expect(p.employee.employeeId).toBe(mgrId)
    expect(p.chain.length).toBeGreaterThan(0)
    expect(p.chain.at(-1)?.managerId ?? null).toBeNull()
    expect(p.directs.length).toBeGreaterThan(0)
    expect(p.orgSize).toBeGreaterThanOrEqual(p.directs.length)
  })
  it('returns null for unknown people', () => {
    expect(personSummary(ctx, 'nobody')).toBeNull()
  })
})
