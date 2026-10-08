/**
 * HR ops' open case queue (`openCaseRows`, docs/ROLES-V2.md 5.8) and the item changes of 5.14:
 * Benefits cases wait on Benefits, final pay past due is legal exposure, and every item carries
 * its place (an employee relations case without a site).
 */
import { describe, expect, it } from 'vitest'
import { buildContext } from '@/data/context'
import { DEFAULT_FILTERS } from '@/data/scope'
import { servicesActions } from './actions'
import { openCaseRows, slaStateOf } from './cases'
import { computeCached } from './index'
import { emp, fixtureContext, kase, sampleContext, tx } from './testkit'

const AS_OF = '2026-09-30'
const employees = Array.from({ length: 6 }, (_, i) =>
  emp({ employeeId: `E${i}`, name: `Person ${i}`, location: i < 3 ? 'San Jose' : 'Bengaluru' }),
)

describe('the SLA state of an open case', () => {
  it('is past target, due within 24 h, within target, or no target', () => {
    // The end of the as-of day is 30 Sep 23:59.
    expect(slaStateOf({ openedAt: '2026-09-28T09:00', resolutionTarget: 48 }, AS_OF)).toBe('Past target')
    expect(slaStateOf({ openedAt: '2026-09-30T09:00', resolutionTarget: 30 }, AS_OF)).toBe('Due within 24 h')
    expect(slaStateOf({ openedAt: '2026-09-30T09:00', resolutionTarget: 72 }, AS_OF)).toBe('Within target')
    expect(slaStateOf({ openedAt: '2026-09-30T09:00', resolutionTarget: null }, AS_OF)).toBe('No target')
  })
})

describe('openCaseRows', () => {
  const open = (p: Parameters<typeof kase>[0]) =>
    kase({ resolvedAt: null, status: 'In progress', firstResponseAt: null, ...p })
  const cases = [
    open({
      caseId: 'HR-2',
      openedAt: '2026-09-20T09:00',
      requesterId: 'E1',
      category: 'Benefits',
      team: 'Benefits',
    }),
    open({ caseId: 'HR-1', openedAt: '2026-09-02T09:00', requesterId: 'E0' }),
    open({
      caseId: 'HR-ER',
      openedAt: '2026-09-10T09:00',
      requesterId: 'E2',
      category: 'Employee relations',
      team: 'Employee relations',
    }),
    kase({ caseId: 'HR-DONE', requesterId: 'E3' }),
    ...employees.slice(3).map((e, i) =>
      open({
        caseId: `HR-${10 + i}`,
        requesterId: e.employeeId,
        openedAt: '2026-09-29T09:00',
        resolutionTargetHours: 240,
      }),
    ),
  ]

  it('lists open cases oldest first, never an employee relations case, and counts those in one line', () => {
    const m = computeCached(fixtureContext({ cases, employees }))
    const out = openCaseRows(m)
    expect(out.rows.map((r) => r.caseId)).toEqual(['HR-1', 'HR-2', 'HR-10', 'HR-11', 'HR-12'])
    expect(out.rows[0]).toMatchObject({
      category: 'Payroll',
      priority: 'P3',
      channel: 'Portal',
      sla: 'Past target',
    })
    expect(out.rows.at(-1)?.sla).toBe('Within target')
    expect(out.privateOpen).toBe(1)
    expect(out.privateNote).toBe('1 employee relations case is open. They are counted, never listed.')
  })

  it('says 0 too, and leaves the line out when the scope holds fewer than 5 people', () => {
    const none = openCaseRows(
      computeCached(fixtureContext({ cases: cases.filter((c) => c.caseId !== 'HR-ER'), employees })),
    )
    expect(none.privateNote).toBe('0 employee relations cases are open. They are counted, never listed.')
    // Three people in San Jose: under the minimum, so the case count is left out too.
    const data = { ...fixtureContext({ cases, employees }).all }
    const small = computeCached(
      buildContext({
        data,
        sources: fixtureContext({ cases, employees }).sources,
        filters: { ...DEFAULT_FILTERS, location: ['San Jose'] },
        asOfOverride: AS_OF,
        showPay: false,
      }),
    )
    expect(small.smallScope).toBe(true)
    expect(openCaseRows(small)).toMatchObject({ privateOpen: null, privateNote: null })
  })

  it('on the sample: the rows are the open cases that are not employee relations', () => {
    const m = computeCached(sampleContext())
    const out = openCaseRows(m)
    const open = m.cases.filter((f) => f.open)
    expect(out.rows.length + (out.privateOpen ?? 0)).toBe(open.length)
    for (const r of out.rows) expect(r.category).not.toBe('Employee relations')
  })
})

describe('HR ops items', () => {
  it('gives Benefits cases to Benefits, out of Total rewards', () => {
    const benefits = kase({
      caseId: 'HR-B',
      category: 'Benefits',
      team: 'Benefits',
      requesterId: 'E0',
      openedAt: '2026-09-01T09:00',
      resolvedAt: null,
      status: 'In progress',
    })
    const items = servicesActions(
      fixtureContext({ cases: [benefits, kase({ requesterId: 'E1' })], employees }),
    )
    expect(items.find((i) => i.id === 'services:case:HR-B')).toMatchObject({
      ownerRole: 'benefits',
      place: { businessUnit: 'Silicon Engineering', location: 'San Jose', region: 'Americas' },
    })
  })

  it('marks final pay past due as legal exposure, and other transactions not', () => {
    const transactions = [
      tx({ type: 'Termination', employeeId: 'E0', dueDate: '2026-09-25', completedDate: null }),
      tx({ type: 'Compensation change', employeeId: 'E1', dueDate: '2026-09-25', completedDate: null }),
      ...employees.slice(2).map((e) => tx({ employeeId: e.employeeId })),
    ]
    const items = servicesActions(fixtureContext({ employees, transactions }))
    const final = items.find((i) => i.what.startsWith('Termination'))
    const change = items.find((i) => i.what.startsWith('Compensation change'))
    expect(final?.exposure).toBe(true)
    expect(change?.exposure).toBeUndefined()
    expect(final?.what).toBe('Termination for Person 0 is not processed, due 25 Sep')
  })

  it('places an employee relations case by business unit and region only, never a site', () => {
    for (const i of servicesActions(sampleContext()).filter((x) => x.subject.kind === 'none'))
      expect(i.place?.location, i.id).toBeNull()
  })
})
