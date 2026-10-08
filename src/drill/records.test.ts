import { describe, expect, it } from 'vitest'
import { buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { resolveDrill } from './Drill'
import { personSummary } from './person'
import { buildDrillTable, drillNoun, drillTableHint, PERSON_KEY, rowPerson } from './records'
import { activeOrg } from './related'
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

  it('shows Job family and Job function after the title when a row has them, and not otherwise', () => {
    const rows = data.employees.filter((e) => e.jobFunction === 'Design RTL').slice(0, 5)
    const t = buildDrillTable(drillSpec({ kind: 'employees', title: 'Design RTL', rows }), ctx)
    const keys = t.columns.map((c) => c.key)
    expect(keys.slice(keys.indexOf('jobTitle'), keys.indexOf('jobTitle') + 3)).toEqual([
      'jobTitle',
      'jobFamily',
      'jobFunction',
    ])
    expect(t.rows[0]).toMatchObject({ jobFamily: 'Silicon Engineering', jobFunction: 'Design RTL' })
    const bare = rows.map((e) => ({ ...e, jobFamily: null, jobFunction: null }))
    const none = buildDrillTable(drillSpec({ kind: 'employees', title: 'No jobs', rows: bare }), ctx)
    expect(none.columns.map((c) => c.key)).not.toContain('jobFamily')
    expect(none.columns.map((c) => c.key)).not.toContain('jobFunction')
    // A view's own column with the same key takes the standard one's place.
    const extra = buildDrillTable(
      drillSpec({
        kind: 'employees',
        title: 'Extra',
        rows,
        extra: {
          columns: [{ key: 'jobFamily', label: 'Job family' }],
          values: (e) => ({ jobFamily: e.jobFamily }),
        },
      }),
      ctx,
    )
    expect(extra.columns.filter((c) => c.key === 'jobFamily')).toHaveLength(1)
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

  it('never ties an employee relations case to a named person', () => {
    const er = data.cases.filter((c) => c.category === 'Employee relations' && c.requesterId).slice(0, 5)
    expect(er.length).toBeGreaterThan(0)
    const t = buildDrillTable(drillSpec({ kind: 'cases', title: 'ER', rows: er }), ctx)
    for (const r of t.rows) {
      expect(r.requester).toBeNull()
      expect(r[PERSON_KEY]).toBeNull()
      expect(rowPerson(ctx, r)).toBeNull()
    }
    // Other cases still name their requester and open their card.
    const other = data.cases.find((c) => c.category !== 'Employee relations' && c.requesterId)!
    const o = buildDrillTable(drillSpec({ kind: 'cases', title: 'Other', rows: [other] }), ctx).rows[0]
    expect(o[PERSON_KEY]).toBe(other.requesterId)
    expect(o.requester).not.toBeNull()
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
  it('counts the contractors and interns below a leader apart, so the card can say so', () => {
    const top = [...ctx.org.byId.values()].find((e) => !e.managerId && !e.terminationDate)!
    const p = personSummary(ctx, top.employeeId)!
    const below = activeOrg(ctx, top.employeeId)
    expect(p.orgSize).toBe(below.length)
    expect(p.orgContingent).toBe(below.filter((e) => e.employmentType !== 'Employee').length)
    expect(p.orgContingent).toBeGreaterThan(0)
    expect(p.orgContingent).toBeLessThan(p.orgSize)
  })
  it('returns null for unknown people', () => {
    expect(personSummary(ctx, 'nobody')).toBeNull()
  })
})

describe('counts that open more records', () => {
  const managers = data.employees.filter(
    (e) => !e.terminationDate && e.employmentType === 'Employee' && ctx.org.children.has(e.employeeId),
  )
  const ics = data.employees.filter(
    (e) => !e.terminationDate && e.employmentType === 'Employee' && !ctx.org.children.has(e.employeeId),
  )

  it('gives managers drillable direct reports and org size columns', () => {
    const rows = [...managers.slice(0, 3), ...ics.slice(0, 3)]
    const t = buildDrillTable(drillSpec({ kind: 'employees', title: 'Mixed', rows }), ctx)
    const directs = t.columns.find((c) => c.key === 'directReports')!
    const org = t.columns.find((c) => c.key === 'orgSize')!
    expect(directs.label).toBe('Direct reports')
    expect(org.label).toBe('Org size')
    const mgrRow = t.rows.find((r) => r.employeeId === managers[0].employeeId)!
    const p = personSummary(ctx, managers[0].employeeId)!
    expect(mgrRow.directReports).toBe(p.directs.length)
    expect(mgrRow.orgSize).toBe(p.orgSize)
    const spec = resolveDrill(directs.drill!(mgrRow))!
    expect(spec.kind).toBe('employees')
    expect(spec.rows).toHaveLength(p.directs.length)
    expect(resolveDrill(org.drill!(mgrRow))!.rows).toHaveLength(p.orgSize)
    // Individual contributors show 0 and open nothing.
    const icRow = t.rows.find((r) => r.employeeId === ics[0].employeeId)!
    expect(icRow.directReports).toBe(0)
    expect(directs.drill!(icRow)).toBeNull()
  })

  it('leaves the org columns out when nobody listed manages anyone', () => {
    const t = buildDrillTable(drillSpec({ kind: 'employees', title: 'ICs', rows: ics.slice(0, 5) }), ctx)
    expect(t.columns.map((c) => c.key)).not.toContain('directReports')
    expect(t.columns.map((c) => c.key)).not.toContain('orgSize')
  })

  it("links a view's own direct reports column when it counts the same people", () => {
    const m = managers[0]
    const n = personSummary(ctx, m.employeeId)!.directs.length
    const spec = drillSpec({
      kind: 'employees',
      title: 'Managers',
      rows: [m, managers[1]],
      extra: {
        columns: [{ key: 'directs', label: 'Direct reports', format: 'int' }],
        values: (e) => ({ directs: e.employeeId === m.employeeId ? n : 999 }),
      },
    })
    const t = buildDrillTable(spec, ctx)
    // The view's column replaces the standard one.
    expect(t.columns.filter((c) => c.label === 'Direct reports')).toHaveLength(1)
    const col = t.columns.find((c) => c.key === 'directs')!
    expect(resolveDrill(col.drill!(t.rows[0]))!.rows).toHaveLength(n)
    // A count that does not match the shared definition opens nothing rather than the wrong people.
    expect(col.drill!(t.rows[1])).toBeNull()
  })

  it('gives requisitions an applications count that opens them', () => {
    const req = data.requisitions.find((r) => data.candidates.some((c) => c.reqId === r.reqId))!
    const t = buildDrillTable(drillSpec({ kind: 'requisitions', title: 'Reqs', rows: [req] }), ctx)
    const col = t.columns.find((c) => c.key === 'applications')!
    const spec = resolveDrill(col.drill!(t.rows[0]))!
    expect(spec.kind).toBe('candidates')
    expect(spec.rows.length).toBe(t.rows[0].applications)
    expect(spec.rows.every((c) => (c as { reqId: string }).reqId === req.reqId)).toBe(true)
  })

  it('opens the active candidates behind a view’s pipeline column and drops the applications count', () => {
    const req = data.requisitions.find((r) =>
      data.candidates.some((c) => c.reqId === r.reqId && c.status === 'Active'),
    )!
    const active = data.candidates.filter(
      (c) => c.reqId === req.reqId && c.status === 'Active' && c.appliedDate <= ctx.asOf,
    ).length
    const t = buildDrillTable(
      drillSpec({
        kind: 'requisitions',
        title: 'Open reqs',
        rows: [req],
        extra: {
          columns: [
            { key: 'activeCandidates', label: 'Active candidates', format: 'int' },
            { key: 'lackingNextStep', label: 'Lacking a next step', format: 'int' },
          ],
          values: () => ({ activeCandidates: active, lackingNextStep: 1 }),
        },
      }),
      ctx,
    )
    expect(t.columns.map((c) => c.key)).not.toContain('applications')
    const col = t.columns.find((c) => c.key === 'activeCandidates')!
    expect(resolveDrill(col.drill!(t.rows[0]))!.rows).toHaveLength(active)
    // The view's own definition of "lacking a next step" is not known here: no guessed list.
    expect(t.columns.find((c) => c.key === 'lackingNextStep')!.drill).toBeUndefined()
  })
})

describe('rows that open something', () => {
  it('opens a person only when they are in the roster', () => {
    const e = data.employees[0]
    expect(rowPerson(ctx, { [PERSON_KEY]: e.employeeId })).toBe(e.employeeId)
    expect(rowPerson(ctx, { [PERSON_KEY]: 'nobody' })).toBeNull()
    expect(rowPerson(ctx, { [PERSON_KEY]: null })).toBeNull()
    const apps = buildDrillTable(
      drillSpec({ kind: 'candidates', title: 'Apps', rows: data.candidates.slice(0, 5) }),
      ctx,
    )
    expect(apps.rows.every((r) => rowPerson(ctx, r) === null)).toBe(true)
  })

  it('says what a row opens and when counts open their own records', () => {
    expect(drillTableHint('requisitions', { rowsOpen: true, cellsOpen: false })).toBe(
      'Select a row to open the hiring manager.',
    )
    expect(drillTableHint('employees', { rowsOpen: true, cellsOpen: true })).toBe(
      'Select a row to open the person. Underlined counts open their own records.',
    )
    expect(drillTableHint('candidates', { rowsOpen: false, cellsOpen: false })).toBeNull()
  })
})
